import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";
import "@nomiclabs/hardhat-etherscan";

dotenvConfig({ path: resolve(__dirname, "./.env") });

const config: HardhatUserConfig = {
  solidity: "0.8.20",
  networks: {
    arbitrum: {
      accounts: [process.env.PRIVATE_KEY as string],
      url: "https://goerli-rollup.arbitrum.io/rpc",
      chainId: 421613,
    },
    base: {
      accounts: [process.env.PRIVATE_KEY as string],
      url: "https://base-goerli.public.blastapi.io",
      chainId: 84531,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    customChains: [
      {
        network: "base",
        chainId: 84531,
        urls: {
          apiURL: "https://api-goerli.basescan.org/api",
          browserURL: "https://goerli.basescan.org/",
        },
      },
    ],
  },
};

export default config;
