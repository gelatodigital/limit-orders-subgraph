import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  dataSource,
  log
} from "@graphprotocol/graph-ts";
import { DepositToken } from "../entities/ERC20OrderRouter/ERC20OrderRouter";
import {
  DepositETH,
  GelatoPineCore,
  OrderCancelled,
  OrderExecuted
} from "../entities/GelatoPineCore/GelatoPineCore";
import { Order } from "../entities/schema";
import {
  CANCELLED,
  EXECUTED,
  getGelatoPineCoreAddressByNetwork,
  OPEN
} from "../modules/Order";

/**
 * @dev ERC20 transfer should have an extra data we use to identify a order.
 * A transfer with a order looks like:
 *
 * 0xa9059cbb
 * 000000000000000000000000c8b6046580622eb6037d5ef2ca74faf63dc93631
 * 0000000000000000000000000000000000000000000000000de0b6b3a7640000
 * 0000000000000000000000000000000000000000000000000000000000000060
 * 0000000000000000000000000000000000000000000000000000000000000120
 * 000000000000000000000000ef6c6b0bce4d2060efab0d16736c6ce7473deddc
 * 000000000000000000000000c7ad46e0b8a400bb3c915120d284aafba8fc4735
 * 0000000000000000000000005523f2fc0889a6d46ae686bcd8daa9658cf56496
 * 0000000000000000000000008153f16765f9124d754c432add5bd40f76f057b4
 * 00000000000000000000000000000000000000000000000000000000000000c0
 * 67656c61746f6e6574776f726b2020d83ddc09ea73fa863b164de440a270be31
 * 0000000000000000000000000000000000000000000000000000000000000060
 * 000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
 * 00000000000000000000000000000000000000000000000004b1e20ebf83c000
 * 000000000000000000000000842A8Dea50478814e2bFAFF9E5A27DC0D1FdD37c
 *
 * The important part is 67656c61746f6e6574776f726b which is gelato's secret (gelatonetwork in hex)
 * We use that as the index to parse the input data:
 * - module = 5 * 32 bytes before secret index
 * - inputToken = ERC20 which emits the Transfer event
 * - owner = `from` parameter of the Transfer event
 * - witness = 2 * 32 bytes before secret index
 * - secret = 32 bytes from the secret index
 * - data = 2 * 32 bytes after secret index (64 or 96 bytes length). Contains:
 *   - outputToken =  2 * 32 bytes after secret index
 *   - minReturn =  3 * 32 bytes after secret index
 *   - handler =  4 * 32 bytes after secret index (optional)
 *
 */

export function handleDepositToken(event: DepositToken): void {
  let id = event.params.key.toHex();
  let order = Order.load(id);
  if (order != null) {
    log.debug("Duplicate Token Order {}", [id]);
    return;
  } else {
    order = new Order(id);
  }

  // Order data
  order.owner = event.params.owner.toHexString();

  order.module = event.params.module.toHexString();
  order.inputToken = event.params.inputToken.toHexString();
  order.witness = event.params.witness.toHexString();
  order.secret = event.params.secret.toHex();

  order.outputToken = "0x" + event.params.data.toHex().substr(2 + 24, 40); // 7 - 20 bytes

  order.minReturn = BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(
      "0x" + event.params.data.toHex().substr(2 + 64, 64)
    ).reverse() as Bytes
  ); // 8 - 32 bytes

  let dataLength = BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(
      // 10 (to remove method sig 0x486046a8) + 64 * 7 (7th field we are looking for)
      "0x" + event.transaction.input.toHexString().substr(10 + 64 * 7, 64)
    ).reverse() as Bytes
  );

  // if length is 96 it means there are 3 params encoded (3 * 32): outputToken, minReturn and handler,
  // otherwise only 2 should be encoded (2 * 32): outputToken and minReturn
  let hasHandlerEncoded = dataLength.equals(BigInt.fromI32(96)) ? true : false;

  let isStopLimitOrder = dataLength.equals(BigInt.fromI32(128)) ? true : false;

  if (hasHandlerEncoded)
    order.handler =
      "0x" + event.params.data.toHex().substr(2 + 64 * 2 + 24, 40);

  if (isStopLimitOrder) {
    order.maxReturn = BigInt.fromUnsignedBytes(
      ByteArray.fromHexString(
        "0x" + event.params.data.toHex().substr(2 + 64 * 2 + 40, 64)
      ).reverse() as Bytes
    ); // 8 - 32 bytes
  }

  order.inputAmount = event.params.amount;

  order.data = event.params.data;

  let gelatoPineCore = GelatoPineCore.bind(
    getGelatoPineCoreAddressByNetwork(dataSource.network())
  );
  let vaultResponse = gelatoPineCore.try_vaultOfOrder(
    Address.fromString(order.module),
    Address.fromString(order.inputToken),
    Address.fromString(order.owner),
    Address.fromString(order.witness),
    order.data
  );

  order.vault = vaultResponse.reverted
    ? null
    : vaultResponse.value.toHexString();

  order.status = OPEN;

  // Tx data
  order.inputData = event.transaction.input;
  order.createdTxHash = event.transaction.hash;
  order.blockNumber = event.block.number;
  order.createdAt = event.block.timestamp;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}

export function handleETHOrderCreated(event: DepositETH): void {
  let id = event.params._key.toHex();
  let order = Order.load(id);
  if (order != null) {
    log.debug("Duplicate ETH Order {}", [id]);
    return;
  } else {
    order = new Order(id);
  }

  // Order data
  order.owner = "0x" + event.params._data.toHex().substr(2 + 64 * 2 + 24, 40); /// 1 - 32 bytes
  order.module = "0x" + event.params._data.toHex().substr(2 + 64 * 0 + 24, 40); /// 0 - 20 bytes
  order.inputToken =
    "0x" + event.params._data.toHex().substr(2 + 64 * 1 + 24, 40); /// 1 - 32 bytes
  order.witness = "0x" + event.params._data.toHex().substr(2 + 64 * 3 + 24, 40); // 3  - 20 bytes
  order.secret = "0x" + event.params._data.toHex().substr(2 + 64 * 5, 64); // 5  - 32 bytes
  order.outputToken =
    "0x" + event.params._data.toHex().substr(2 + 64 * 7 + 24, 40); // 7 - 20 bytes

  order.minReturn = BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(
      "0x" + event.params._data.toHex().substr(2 + 64 * 8, 64)
    ).reverse() as Bytes
  ); // 8 - 32 bytes

  let dataLength = BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(
      "0x" + event.params._data.toHexString().substr(2 + 64 * 6, 64)
    ).reverse() as Bytes
  );

  // if length is 96 it means there are 3 params encoded (3 * 32): outputToken, minReturn and handler,
  // otherwise only 2 should be encoded (2 * 32): outputToken and minReturn
  let hasHandlerEncoded = dataLength.equals(BigInt.fromI32(96)) ? true : false;

  let isStopLimitOrder = dataLength.equals(BigInt.fromI32(128)) ? true : false;

  if (hasHandlerEncoded)
    order.handler =
      "0x" + event.params._data.toHex().substr(2 + 64 * 9 + 24, 40);

  order.inputAmount = event.params._amount;

  order.vault = getGelatoPineCoreAddressByNetwork(
    dataSource.network()
  ).toHexString();

  if (isStopLimitOrder) {
    order.data = Bytes.fromHexString(
      "0x" + event.params._data.toHex().substr(2 + 64 * 7, 64 * 4)
    ) as Bytes;

    order.maxReturn = BigInt.fromUnsignedBytes(
      ByteArray.fromHexString(
        "0x" + event.params._data.toHex().substr(2 + 64 * 10, 64)
      ).reverse() as Bytes
    ); // 8 - 32 bytes
  }
  else {
    order.data = Bytes.fromHexString(
      "0x" +
      event.params._data
        .toHex()
        .substr(2 + 64 * 7, hasHandlerEncoded ? 64 * 3 : 64 * 2)
    ) as Bytes;
  }

  order.status = OPEN;

  // Tx data
  order.inputData = event.transaction.input;
  order.createdTxHash = event.transaction.hash;
  order.blockNumber = event.block.number;
  order.createdAt = event.block.timestamp;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}

export function handleOrderExecuted(event: OrderExecuted): void {
  let order = Order.load(event.params._key.toHex());

  if (order == null) {
    return;
  }

  order.executedTxHash = event.transaction.hash;
  order.status = EXECUTED;
  order.bought = event.params._bought;
  order.auxData = event.params._auxData;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}

export function handleOrderCancelled(event: OrderCancelled): void {
  let order = Order.load(event.params._key.toHex());
  if (order == null) {
    return;
  }

  // Check if the cancel was a complete success or not.
  // Sometimes by running out of gas the tx is partially completed
  // check: https://etherscan.io/tx/0x29da2e620e5f8606d74a9b73c353a8f393acc9cd58c1750dd2edd05cf33a5d1c
  let gelatoPineCore = GelatoPineCore.bind(event.address);
  let res = gelatoPineCore.try_existOrder(
    Address.fromString(order.module),
    Address.fromString(order.inputToken),
    Address.fromString(order.owner),
    Address.fromString(order.witness),
    order.data
  );

  if (res.reverted || res.value) {
    return;
  }

  order.cancelledTxHash = event.transaction.hash;
  order.status = CANCELLED;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}
