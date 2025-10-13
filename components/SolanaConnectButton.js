import React from 'react';
import dynamic from 'next/dynamic';

// Dynamically import wallet button to avoid SSR issues
const WalletMultiButtonDynamic = dynamic(
  async () => (await import('@solana/wallet-adapter-react-ui')).WalletMultiButton,
  { ssr: false }
);

export default function SolanaConnectButton({ className = '' }) {
  return (
    <div className={className}>
      <WalletMultiButtonDynamic />
    </div>
  );
}

