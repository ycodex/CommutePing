import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];
type Database = {
  public: {
    Tables: {
      commutes: {
        Row: { id: string };
        Insert: { id?: string };
        Update: { id?: string };
        Relationships: [];
      };
      device_push_tokens: {
        Row: { id: string; token: string; user_id: string; enabled: boolean };
        Insert: { id?: string; token: string; user_id: string; enabled?: boolean };
        Update: { enabled?: boolean };
        Relationships: [];
      };
      notification_outbox: {
        Row: { id: string };
        Insert: { id?: string };
        Update: {
          status?: 'pending' | 'processing' | 'sent' | 'failed';
          sent_at?: string | null;
          provider_ticket_id?: string | null;
          processing_at?: string | null;
          failure_code?: string | null;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      claim_notification_batch: {
        Args: { p_commute_id?: string | null };
        Returns: {
          notification_id: string;
          recipient_id: string;
          commute_id: string | null;
          title: string;
          body: string;
          data: Json;
        }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};

type OutboxMessage = {
  notification_id: string;
  recipient_id: string;
  commute_id: string | null;
  title: string;
  body: string;
  data: { [key: string]: Json | undefined };
};

type DispatchRequest = { commuteId?: string };
type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; details?: { error?: string } };
type AdminClient = SupabaseClient<Database>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const maximumRequestBytes = 4_096;

Deno.serve(async (request) => {
  const corsHeaders = corsHeadersFor(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, corsHeaders);
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (!Number.isFinite(contentLength) || contentLength > maximumRequestBytes) {
    return jsonResponse({ error: 'Request too large' }, 413, corsHeaders);
  }

  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const publishableKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    return jsonResponse({ error: 'Service unavailable' }, 503, corsHeaders);
  }

  let body: DispatchRequest;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > maximumRequestBytes) {
      return jsonResponse({ error: 'Request too large' }, 413, corsHeaders);
    }
    const raw: unknown = JSON.parse(rawBody);
    if (!isRecord(raw)) throw new Error('Invalid JSON');
    body = { ...(typeof raw.commuteId === 'string' ? { commuteId: raw.commuteId } : {}) };
  } catch {
    return jsonResponse({ error: 'Invalid request' }, 400, corsHeaders);
  }
  if (body.commuteId && !uuidPattern.test(body.commuteId)) {
    return jsonResponse({ error: 'Invalid request' }, 400, corsHeaders);
  }

  const authorized = await authorizeRequest(request, supabaseUrl, publishableKey, body.commuteId);
  if (!authorized) return jsonResponse({ error: 'Unauthorized' }, 401, corsHeaders);

  const admin = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await admin.rpc('claim_notification_batch', {
    p_commute_id: body.commuteId ?? null,
  });
  if (error) return jsonResponse({ error: 'Notification dispatch failed' }, 500, corsHeaders);

  const messages = Array.isArray(data) ? data.filter(isOutboxMessage) : [];
  let sent = 0;
  let failed = 0;
  for (const message of messages) {
    const result = await deliverMessage(admin, message);
    if (result) sent += 1;
    else failed += 1;
  }
  return jsonResponse({ claimed: messages.length, sent, failed }, 200, corsHeaders);
});

async function authorizeRequest(
  request: Request,
  supabaseUrl: string,
  publishableKey: string,
  commuteId?: string,
): Promise<boolean> {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const suppliedCronSecret = request.headers.get('x-cron-secret');
  if (cronSecret && suppliedCronSecret && constantTimeEqual(cronSecret, suppliedCronSecret)) return true;
  if (!commuteId) return false;

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;
  const userClient = createClient<Database>(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return false;
  const { data: commute, error: commuteError } = await userClient
    .from('commutes')
    .select('id')
    .eq('id', commuteId)
    .maybeSingle();
  return !commuteError && commute?.id === commuteId;
}

async function deliverMessage(
  admin: AdminClient,
  message: OutboxMessage,
): Promise<boolean> {
  const { data: rows, error } = await admin
    .from('device_push_tokens')
    .select('id,token')
    .eq('user_id', message.recipient_id)
    .eq('enabled', true)
    .limit(10);
  if (error || !rows || rows.length === 0 || !rows.every((row) => isPushTokenRow(row))) {
    await markFailed(admin, message.notification_id, error ? 'token_lookup_failed' : 'no_registered_device');
    return false;
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
  };
  const expoAccessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (expoAccessToken) headers.Authorization = `Bearer ${expoAccessToken}`;

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(rows.map((row) => ({
        to: row.token,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: 'default',
        priority: 'high',
        channelId: 'commute-alerts',
      }))),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error('Provider rejected request');
    const payload: unknown = await response.json();
    if (!isRecord(payload)
      || !Array.isArray(payload.data)
      || payload.data.length !== rows.length
      || !payload.data.every(isExpoTicket)) throw new Error('Invalid provider response');
    const tickets: ExpoTicket[] = payload.data;
    const successfulTicket = tickets.find((ticket): ticket is Extract<ExpoTicket, { status: 'ok' }> => ticket.status === 'ok');
    const invalidIndexes = tickets
      .map((ticket, index) => ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered' ? index : -1)
      .filter((index) => index >= 0);
    if (invalidIndexes.length > 0) {
      await admin.from('device_push_tokens').update({ enabled: false }).in('id', invalidIndexes.map((index) => rows[index]?.id).filter(Boolean));
    }
    if (!successfulTicket) throw new Error('No notification was accepted');
    await admin.from('notification_outbox').update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      provider_ticket_id: successfulTicket.id,
      processing_at: null,
      failure_code: null,
    }).eq('id', message.notification_id);
    return true;
  } catch {
    await markFailed(admin, message.notification_id, 'provider_request_failed');
    return false;
  }
}

async function markFailed(admin: AdminClient, id: string, code: string): Promise<void> {
  await admin.from('notification_outbox').update({
    status: 'failed',
    processing_at: null,
    failure_code: code,
  }).eq('id', id);
}

function requiredEnvironment(name: string): string | null {
  const value = Deno.env.get(name)?.trim();
  return value && value.length <= 500 ? value : null;
}

function corsHeadersFor(request: Request): HeadersInit {
  const origin = request.headers.get('origin');
  const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return {
    ...(origin && allowedOrigins.includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cron-secret',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body: Record<string, unknown>, status: number, headers: HeadersInit): Response {
  return new Response(JSON.stringify(body), { status, headers });
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function isOutboxMessage(value: unknown): value is OutboxMessage {
  return isRecord(value)
    && typeof value.notification_id === 'string'
    && uuidPattern.test(value.notification_id)
    && typeof value.recipient_id === 'string'
    && uuidPattern.test(value.recipient_id)
    && (value.commute_id === null || (typeof value.commute_id === 'string' && uuidPattern.test(value.commute_id)))
    && typeof value.title === 'string'
    && value.title.length <= 80
    && typeof value.body === 'string'
    && value.body.length <= 180
    && isRecord(value.data);
}

function isExpoTicket(value: unknown): value is ExpoTicket {
  if (!isRecord(value)) return false;
  if (value.status === 'ok') return typeof value.id === 'string' && value.id.length >= 1 && value.id.length <= 200;
  if (value.status !== 'error') return false;
  return value.details === undefined
    || (isRecord(value.details)
      && (value.details.error === undefined || (typeof value.details.error === 'string' && value.details.error.length <= 100)));
}

function isPushTokenRow(value: unknown): value is { id: string; token: string } {
  return isRecord(value)
    && typeof value.id === 'string'
    && uuidPattern.test(value.id)
    && typeof value.token === 'string'
    && /^Expo(nent)?PushToken\[[A-Za-z0-9_-]+\]$/.test(value.token);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
