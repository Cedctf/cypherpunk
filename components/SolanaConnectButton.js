import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import wallet buttons to avoid SSR issues
const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

const WalletDisconnectButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletDisconnectButton,
  { ssr: false }
);

export default function SolanaConnectButton({ className = '' }) {
  return (
    <div className={`flex gap-2 ${className}`}>
      <WalletMultiButtonDynamic />
    </div>
  );
}

