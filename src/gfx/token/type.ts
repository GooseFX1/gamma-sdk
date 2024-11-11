import { GammaToken } from "@/api/type";
import { TokenProps, Token } from "@/module/token";

export type TokenInfo = GammaToken & {
  programId?: string;
  priority: number;
  userAdded?: boolean;
  type?: string;
};

export interface TokenJson {
  symbol: string;
  name: string;
  mint: string;
  decimals: number;
  extensions: {
    coingeckoId?: string;
  };
  icon: string;
  hasFreeze?: boolean;
}

export type SplToken = TokenProps & {
  icon: string;
  id: string;
  extensions: {
    [key in "coingeckoId" | "website" | "whitepaper"]?: string;
  };
  userAdded?: boolean; // only if token is added by user
};
