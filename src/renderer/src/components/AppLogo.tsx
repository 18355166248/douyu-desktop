import appIcon from '../../../../build/icon.png';

interface AppLogoProps {
  size?: number;
  className?: string;
}

export function AppLogo({ size = 25, className }: AppLogoProps): React.JSX.Element {
  return (
    <img
      className={className}
      src={appIcon}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0 }}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
