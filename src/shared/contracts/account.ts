export interface AccountSummary {
  id: string;
  platform: 'douyu';
  uid: string;
  nickname: string;
  avatarUrl: string;
  status: 'active' | 'expired';
  lastLoginAt: number;
  isActive: boolean;
}

export interface AccountHealth {
  status: 'active' | 'expired';
  checkedAt: number;
  message?: string;
}
