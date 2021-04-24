import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  dataSource,
  log
} from "@graphprotocol/graph-ts";
import { Transfer } from "../entities/ERC20/ERC20";
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
  getAddressByNetwork,
  OPEN
} from "../modules/Order";

/**
 * @dev ERC20 transfer should have an extra data we use to identify a pine order.
 * A transfer with a pine order looks like:
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
 * 4200696e652e66696e616e63652020d83ddc09ea73fa863b164de440a270be31
 * 0000000000000000000000000000000000000000000000000000000000000040
 * 000000000000000000000000eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee
 * 00000000000000000000000000000000000000000000000004b1e20ebf83c000
 *
 * The important part is 4200696e652e66696e616e6365 which is pine's secret but starts with 420
 * We use that as the index to parse the input data:
 * - module = 5 * 32 bytes before secret index
 * - inputToken = ERC20 which emits the Transfer event
 * - owner = `from` parameter of the Transfer event
 * - witness = 2 * 32 bytes before secret index
 * - secret = 32 bytes from the secret index
 * - data = 2 * 32 bytes after secret index (64 bytes length)
 * - outputToken =  2 * 32 bytes after secret index
 * - minReturn =  3 * 32 bytes after secret index
 *
 * @param event
 */
export function handleOrderCreationByERC20Transfer(event: Transfer): void {
  let index_ = event.transaction.input
    .toHexString()
    .indexOf("4200696e652e66696e616e6365");
  if (index_ == -1) {
    return;
  }

  let doMultipleCheck2 = false;
  let recipient =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(BigInt.fromI32(10 + 24).toI32(), 40);

  // Skip multiple transfer events
  if (recipient != event.params.to.toHexString()) {
    doMultipleCheck2 = true;
  }

  let index = BigInt.fromI32(index_);

  // Transaction input should be bigger than index + (64 * 4)
  // Index should be bigger than (64 * 5)
  if (
    !(
      index.minus(BigInt.fromI32(64 * 5)).gt(BigInt.fromI32(0)) &&
      BigInt.fromI32(event.transaction.input.toHexString().length).ge(
        index.plus(BigInt.fromI32(64 * 4 - 1))
      )
    )
  ) {
    log.debug("Error creating an order from an ERC20 transfer: {}", [
      event.transaction.hash.toHexString()
    ]);
    return;
  }

  let module =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(index.minus(BigInt.fromI32(64 * 5 - 24)).toI32(), 40);
  let inputToken =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(index.minus(BigInt.fromI32(64 * 4 - 24)).toI32(), 40);
  let owner =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(index.minus(BigInt.fromI32(64 * 3 - 24)).toI32(), 40);
  let witness =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(index.minus(BigInt.fromI32(64 * 2 - 24)).toI32(), 40);
  let data = Bytes.fromHexString(
    "0x" +
      event.transaction.input
        .toHexString()
        .substr(index.plus(BigInt.fromI32(64 * 2)).toI32(), 64 * 2)
  ) as Bytes;

  let gelatoPineCore = GelatoPineCore.bind(
    getAddressByNetwork(dataSource.network())
  );

  if (doMultipleCheck2) {
    let vaultOfOrder = gelatoPineCore.vaultOfOrder(
      Address.fromString(module),
      Address.fromString(inputToken),
      Address.fromString(owner),
      Address.fromString(witness),
      data
    );

    // Skip multiple transfer events ^2
    if (vaultOfOrder.toHexString() != event.params.to.toHexString()) {
      log.debug(
        "Skip Check 2: Skipped Transfer vaultOfOrder expected {}, but receive {}. On Tx {}",
        [
          vaultOfOrder.toHexString(),
          event.params.to.toHexString(),
          event.transaction.hash.toHexString()
        ]
      );
      return;
    }
  }

  let order = new Order(
    gelatoPineCore
      .keyOf(
        Address.fromString(module),
        Address.fromString(inputToken),
        Address.fromString(owner),
        Address.fromString(witness),
        data
      )
      .toHex()
  );

  // Order data
  order.owner = owner;
  order.module = module;
  order.inputToken = inputToken;
  order.witness = witness;
  order.secret =
    "0x" + event.transaction.input.toHexString().substr(index.toI32(), 64);
  order.outputToken =
    "0x" +
    event.transaction.input
      .toHexString()
      .substr(index.plus(BigInt.fromI32(64 * 2 + 24)).toI32(), 40);
  order.minReturn = BigInt.fromUnsignedBytes(
    ByteArray.fromHexString(
      "0x" +
        event.transaction.input
          .toHexString()
          .substr(index.plus(BigInt.fromI32(64 * 3 + 24)).toI32(), 64)
    ).reverse() as Bytes
  );
  order.inputAmount = event.params.value;
  order.vault = event.params.to.toHex();
  order.data = data;
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
  let order = new Order(event.params._key.toHex());

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
  order.inputAmount = event.params._amount;
  order.vault = getAddressByNetwork(dataSource.network()).toHexString();
  order.data = Bytes.fromHexString(
    "0x" + event.params._data.toHex().substr(2 + 64 * 7, 64 * 2)
  ) as Bytes;
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
