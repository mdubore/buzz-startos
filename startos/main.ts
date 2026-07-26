import { sdk } from './sdk'

export const main = sdk.setupMain(async ({ effects }) =>
  sdk.Daemons.of(effects),
)
