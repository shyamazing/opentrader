import type { IGridBotLevel, IGridLine } from "@opentrader/types";
import { XOrderStatus } from "@opentrader/types";

import { isWaitingGridLine } from "./isWaitingGridLine.js";
import { nextGridLinePrice } from "./nextGridLinePrice.js";

/**
 * Computes initial grid levels based on current asset price.
 *
 * @param gridLines - Grid lines
 * @param currentAssetPrice - Current asset price
 * @returns
 */
export function computeGridLevelsFromCurrentAssetPrice(
  gridLines: IGridLine[],
  currentAssetPrice: number,
): IGridBotLevel[] {
  return gridLines.flatMap<IGridBotLevel>((gridLine, i) => {
    if (i === gridLines.length - 1) {
      // skip last grid level because it has no TP
      return [];
    }

    const sellOrderPrice = nextGridLinePrice(gridLines, i);

    if (
      isWaitingGridLine(gridLine, gridLines, currentAssetPrice) ||
      gridLine.price > currentAssetPrice
    ) {
      const gridLevel: IGridBotLevel = {
        buy: {
          price: gridLine.price,
          quantity: gridLine.quantity,
          status: XOrderStatus.Filled,
        },
        sell: {
          price: sellOrderPrice,
          quantity: gridLine.quantity,
          status: XOrderStatus.Idle,
        },
      };

      return [gridLevel];
    }
    // gridLevel < currentAssetPrice

    const gridLevel: IGridBotLevel = {
      buy: {
        price: gridLine.price,
        quantity: gridLine.quantity,
        status: XOrderStatus.Idle,
      },
      sell: {
        price: sellOrderPrice,
        quantity: gridLine.quantity,
        status: XOrderStatus.Idle,
      },
    };

    return [gridLevel];
  });
}
