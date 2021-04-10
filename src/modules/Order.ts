import { Address } from "@graphprotocol/graph-ts";

export const OPEN = "open";
export const EXECUTED = "executed";
export const CANCELLED = "cancelled";

export function getAddressByNetwork(network: string): Address {
  if (network == "mainnet")
    return Address.fromString("0x36049D479A97CdE1fC6E2a5D2caE30B666Ebf92B");

  if (network == "ropsten")
    return Address.fromString("0x0e5096D201Fe2985f5C26432A76f145D6e5D1453");

  throw "No Address specified";
}
