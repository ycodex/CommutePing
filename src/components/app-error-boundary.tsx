import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { palette, radius } from '@/constants/commute-theme';

type Props = { children: ReactNode };
type State = { failed: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (__DEV__) console.error('Commute Ping screen failed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <View style={styles.container}>
        <Text accessibilityRole="header" style={styles.title}>Commute Ping could not load</Text>
        <Text style={styles.copy}>No safety alert was sent. Restart the app before beginning a commute.</Text>
        <Pressable accessibilityRole="button" onPress={() => this.setState({ failed: false })} style={styles.button}>
          <Text style={styles.buttonText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.phone, padding: 28 },
  title: { color: palette.text, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  copy: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 12, maxWidth: 340 },
  button: { minHeight: 46, minWidth: 150, borderRadius: radius.medium, backgroundColor: palette.blue, alignItems: 'center', justifyContent: 'center', marginTop: 24, paddingHorizontal: 20 },
  buttonText: { color: palette.white, fontSize: 13, fontWeight: '700' },
});
