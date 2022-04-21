import {
  Address,
  BigInt,
  ByteArray,
  Bytes,
  dataSource,
  ethereum,
  log
} from "@graphprotocol/graph-ts";
import {
  LogDeposit,
  LogFill,
  LogCancelled,
  GelatoOrdersVault
} from "../entities/GelatoOrdersVault/GelatoOrdersVault";
import { OrderV2 } from "../entities/schema";
import {
  CANCELLED,
  EXECUTED,
  getGelatoOrdersVaultAddressByNetwork,
  OPEN
} from "../modules/Order";

export function handleOrderDeposited(event: LogDeposit): void {
  let id = event.params.key.toHex();
  let order = OrderV2.load(id);
  if (order != null) {
    log.debug("Duplicate Token Order {}", [id]);
    return;
  } else {
    order = new OrderV2(id);
  }

  // Order data
  order.owner = event.params.order.owner.toString();
  order.module = event.params.order.module.toString();
  order.inputToken = event.params.order.inputToken.toString();
  order.outputToken = event.params.order.outputToken.toString();
  order.minReturn = event.params.order.minReturn;
  order.inputAmount = event.params.order.amountIn;
  order.data = event.params.order.data;
  order.status = OPEN;
  order.handler = event.params.order.handler.toString();
  order.salt = event.params.order.salt;

  let dataLength = event.params.order.data.length;
  // if length is 96 it means there are 3 params encoded (3 * 64): outputToken, minReturn and handler,

  let isStopLimitOrder = dataLength > 3 * 32 ? true : false;

  if (isStopLimitOrder) {
    order.maxReturn = BigInt.fromUnsignedBytes(
      ByteArray.fromHexString(
        "0x" +
          event.params.order.data
            .toHex()
            .slice(2 + 32 * 3, 32)
            .trimLeft()
      ).reverse() as Bytes
    ); // 8 - 32 bytes
  }

  // Tx data
  
  order.orderHash = event.params._event.parameters[1].value.data.toString();
  order.createdTxHash = event.transaction.hash;
  order.blockNumber = event.block.number;
  order.createdAt = event.block.timestamp;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}

export function handleOrderFilled(event: LogFill): void {
  let order = OrderV2.load(event.params.key.toHex());

  if (order == null) {
    return;
  }

  order.executedTxHash = event.transaction.hash;
  order.status = EXECUTED;
  order.bought = event.params.amountOut;
  order.auxData = event.params.auxData;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}

export function handleOrderCancelled(event: LogCancelled): void {
  let order = OrderV2.load(event.params.key.toHex());
  if (order == null) {
    return;
  }

  const orderStruct = ethereum.Value.fromString(order.orderHash).toTuple();

  let gelatoPineCore = GelatoOrdersVault.bind(event.address);

  let result = gelatoPineCore.tryCall(
    "isActiveOrder",
    "isActiveOrder((address,address,address,address,address,uint256,uint256,uint256,bytes)):(bool)",
    [ethereum.Value.fromTuple(orderStruct)]
  );

  let value = result.value;
  const bool = ethereum.CallResult.fromValue(value[0].toBoolean());

  if (result.reverted || bool) {
    return;
  }

  order.cancelledTxHash = event.transaction.hash;
  order.status = CANCELLED;
  order.updatedAt = event.block.timestamp;
  order.updatedAtBlock = event.block.number;
  order.updatedAtBlockHash = event.block.hash.toHexString();

  order.save();
}
