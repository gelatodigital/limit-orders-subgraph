import { Address } from "@graphprotocol/graph-ts";

export const OPEN = "open";
export const EXECUTED = "executed";
export const CANCELLED = "cancelled";

export function getGelatoPineCoreAddressByNetwork(network: string): Address {
  if (network == "avalanche")
    return Address.fromString("0x0c30D3d66bc7C73A83fdA929888c34dcb24FD599");

  if (network == "bsc")
    return Address.fromString("0x0c30D3d66bc7C73A83fdA929888c34dcb24FD599");

  if (network == "fantom")
    return Address.fromString("0x05Ad1094Eb6Cde564d732196F6754Ee464896031");

  if (network == "mainnet")
    return Address.fromString("0x36049D479A97CdE1fC6E2a5D2caE30B666Ebf92B");

  if (network == "matic")
    return Address.fromString("0x38c4092b28dAB7F3d98eE6524549571c283cdfA5");

  if (network == "ropsten")
    return Address.fromString("0x0e5096D201Fe2985f5C26432A76f145D6e5D1453");

  if (network == "cronos")
    return Address.fromString("0x5d41545c190637b9337ec5ffa89bac5ee0cb3a4c");

  throw "No Address specified";
}
