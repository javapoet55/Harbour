import { Text as RNText, type TextProps as RNTextProps } from 'react-native';

import { useTheme, type Palette, type TextVariant } from '../theme';

export type TextTone = keyof Pick<Palette, 'ink' | 'secondary' | 'tint' | 'onTint' | 'danger' | 'scheduleBlue'>;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  tone?: TextTone;
};

export function Text({ variant = 'body', tone = 'ink', style, ...rest }: TextProps) {
  const theme = useTheme();
  return <RNText style={[theme.typography[variant], { color: theme.colors[tone] }, style]} {...rest} />;
}
