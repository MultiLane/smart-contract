import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

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
};

export default config;
