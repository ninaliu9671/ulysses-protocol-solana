export interface PaymentDetails {
  network: string;
  asset: string;
  amount: string;
  payTo: string;
  memo: string;
  expiresAt: number;
}

export interface X402Response {
  authorized: boolean;
}
