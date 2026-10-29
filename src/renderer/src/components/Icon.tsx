import {
  Keyboard,
  CalendarCheck,
  CalendarCheck2,
  Settings,
  UserRound,
  Play,
  Plus,
  LogOut,
  Volume2,
  VolumeX,
  Headphones,
  MessageSquareText,
  MessageSquareOff,
  MessageSquare,
  Pause,
  RotateCw,
  X,
  CircleCheck,
  TriangleAlert,
  ChevronDown,
  Sparkles,
  LayoutGrid,
  LockKeyhole,
  Minus,
  Square,
  Copy,
  History,
  House,
  Star,
  Gift,
  Trash2,
  Maximize,
  Minimize,
  Pin,
  PinOff,
  GripVertical,
  CopyPlus,
  PictureInPicture2,
  PanelTop,
  PanelsTopLeft,
  Replace,
  MonitorPlay,
  Link,
  LoaderCircle,
  Layers,
  UserRoundPlus,
  Eraser,
  BellRing,
} from 'lucide-react';
import type { SVGProps } from 'react';

// 按操作语义命名，避免副屏、小窗、替换房间再次共用一个“网格”图标。
// 显式导入使用到的组件，构建时可移除图标库中未使用的资源。
const icons = {
  keyboard: Keyboard,
  live: MonitorPlay,
  tasks: CalendarCheck,
  taskDone: CalendarCheck2,
  settings: Settings,
  user: UserRound,
  addAccount: UserRoundPlus,
  play: Play,
  plus: Plus,
  logout: LogOut,
  volume: Volume2,
  volumeOff: VolumeX,
  headphones: Headphones,
  danmaku: MessageSquareText,
  danmakuOff: MessageSquareOff,
  danmakuPause: MessageSquare,
  danmakuResume: MessageSquare,
  pause: Pause,
  refresh: RotateCw,
  loading: LoaderCircle,
  close: X,
  check: CircleCheck,
  alert: TriangleAlert,
  chevron: ChevronDown,
  spark: Sparkles,
  layoutGrid: LayoutGrid,
  lock: LockKeyhole,
  minimize: Minus,
  maximize: Square,
  restore: Copy,
  history: History,
  home: House,
  star: Star,
  gift: Gift,
  trash: Trash2,
  enterImmersive: Maximize,
  exitImmersive: Minimize,
  pin: Pin,
  unpin: PinOff,
  grip: GripVertical,
  newWindow: CopyPlus,
  enterCompact: PictureInPicture2,
  exitCompact: PanelTop,
  mainView: PanelsTopLeft,
  replaceRoom: Replace,
  roomLink: Link,
  scenes: Layers,
  clearDanmaku: Eraser,
  reminder: BellRing,
};
export type IconName = keyof typeof icons;

export interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 18, ...props }: IconProps): React.JSX.Element {
  const Component = icons[name];
  return (
    <Component
      size={size}
      strokeWidth={1.8}
      aria-hidden="true"
      focusable="false"
      data-icon={name}
      {...props}
    >
      {/* 弹幕播放状态放在消息气泡内，与视频的播放/暂停明确区分。 */}
      {name === 'danmakuPause' ? <path d="M10 7v6m4-6v6" /> : null}
      {name === 'danmakuResume' ? (
        <path d="m10 7 5 3-5 3Z" fill="currentColor" stroke="none" />
      ) : null}
    </Component>
  );
}
