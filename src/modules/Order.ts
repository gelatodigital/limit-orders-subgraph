import { Address } from "@graphprotocol/graph-ts"

export const OPEN = 'open'
export const EXECUTED = 'executed'
export const CANCELLED = 'cancelled'

export function getAddressByNetwork(network: string): Address {
  if (network == 'mainnet') {
    return Address.fromString('0x36049D479A97CdE1fC6E2a5D2caE30B666Ebf92B')
  } if (network == 'ropsten') {
    return Address.fromString('0xb6c2E1B5AB82d8e555ABAa00BAc4606Ab5EA4668')
  }

  throw 'No Address specified'
}