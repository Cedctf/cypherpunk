import "@/styles/globals.css";
import "../styles/manga.css"; // ✅ keep your manga.css
import { useRouter } from "next/router";
import { SolanaWalletProvider } from "@/components/SolanaWalletProvider";
import SolanaConnectButton from "@/components/SolanaConnectButton";

export default function App({ Component, pageProps }) {
  const router = useRouter();

  return (
    <SolanaWalletProvider>
      <div className="dark">
        {/* Floating connect wallet button in the corner (hidden on landing page) */}
        {router.pathname !== "/" && (
          <div className="fixed top-4 right-4 z-[900]">
            <SolanaConnectButton className="cta-primary" />
          </div>
        )}
        <Component {...pageProps} />
      </div>
    </SolanaWalletProvider>
  );
}
