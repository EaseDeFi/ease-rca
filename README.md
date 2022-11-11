# Reciprocally-Covered Assets

https://ease.org/learn/learn-crypto-defi/

## Local Development
1. clone this repo
   `git clone git@github.com:EaseDeFi/ease-rca.git`
2. create new `.env` file and fill values from `.env.example`
3. Compile contracts - `npm run build`
4. Run tests - `npm test`

## Mainnet deployment
1. `npx hardhat run deploy/scriptYouWantToRun.ts --network mainnet/goerli`


# Before commit (Fix Lint and Prettier)

1. Check and fix linting issues = `npm run lint:check` && `npm run lint:fix`
2. Check and fix format issuse = `npm run prettier:check` && `npm run prettier:format`
