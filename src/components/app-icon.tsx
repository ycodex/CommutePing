import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { Text, type ColorValue } from 'react-native';

type AppIconProps = {
  name: SymbolViewProps['name'];
  size?: number;
  color?: ColorValue;
};

export function AppIcon({ name, size = 20, color = '#FFFFFF' }: AppIconProps) {
  return (
    <SymbolView
      name={name}
      size={size}
      tintColor={color}
      fallback={<Text style={{ color, fontSize: Math.max(12, size - 3) }}>●</Text>}
    />
  );
}
