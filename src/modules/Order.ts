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

  throw "No Address specified";
}


export function getGelatoOrdersVaultAddressByNetwork(network: string): Address {
  if (network == "avalanche")
    return Address.fromString("");

  if (network == "bsc")
    return Address.fromString("");

  if (network == "fantom")
    return Address.fromString("");

  if (network == "mainnet")
    return Address.fromString("");

  if (network == "matic")
    return Address.fromString("0xDBe356FA623B5E588B8f51F6D7Cf1c39d6162A3C");

  if (network == "ropsten")
    return Address.fromString("");

  throw "No Address specified";
}
