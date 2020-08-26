import { useMemo } from 'react';

import { GroupRow, GroupByDictionary, Dictionary } from '../types';
import { getVerticalRangeToRender } from '../utils';

interface ViewportRowsArgs<R, SR> {
  rawRows: readonly R[];
  rowHeight: number;
  clientHeight: number;
  scrollTop: number;
  groupBy: readonly string[];
  rowGrouper?: (rows: readonly R[], columnKey: string) => Dictionary<readonly R[]>;
  expandedGroupIds?: ReadonlySet<unknown>;
}

export function useViewportRows<R, SR>({
  rawRows,
  rowHeight,
  clientHeight,
  scrollTop,
  groupBy,
  rowGrouper,
  expandedGroupIds
}: ViewportRowsArgs<R, SR>) {
  const [groupedRows, rowsCount] = useMemo(() => {
    if (groupBy.length === 0 || !rowGrouper) return [undefined, rawRows.length];

    const groupRows = (rows: readonly R[], [groupByKey, ...remainingGroupByKeys]: readonly string[], startRowIndex: number): [GroupByDictionary<R>, number] => {
      let groupRowsCount = 0;
      const groups: GroupByDictionary<R> = {};
      for (const [key, childRows] of Object.entries(rowGrouper(rows, groupByKey))) {
        // Recursively group each parent group
        const [childGroups, childRowsCount] = remainingGroupByKeys.length === 0
          ? [childRows, childRows.length]
          : groupRows(childRows, remainingGroupByKeys, startRowIndex + groupRowsCount + 1); // 1 for parent row
        groups[key] = { childRows, childGroups, startRowIndex: startRowIndex + groupRowsCount };
        groupRowsCount += childRowsCount + 1; // 1 for parent row
      }

      return [groups, groupRowsCount];
    };

    return groupRows(rawRows, groupBy, 0);
  }, [groupBy, rowGrouper, rawRows]);

  const [rows, allGroupRows] = useMemo(() => {
    const allGroupRows = new Set<unknown>();
    if (!groupedRows) return [rawRows, allGroupRows];

    const expandGroup = (rows: GroupByDictionary<R> | readonly R[], parentKey: string | undefined, level: number): Array<GroupRow<R> | R> => {
      if (Array.isArray(rows)) return rows;
      const flattenedRows: Array<R | GroupRow<R>> = [];
      Object.keys(rows).forEach((key, posInSet, keys) => {
        // TODO: should users have control over the gerenated key?
        const id = parentKey !== undefined ? `${parentKey}__${key}` : key;
        const isExpanded = expandedGroupIds?.has(id) ?? false;
        const { childRows, childGroups, startRowIndex } = (rows as GroupByDictionary<R>)[key]; // TODO: why is it failing?

        const groupRow: GroupRow<R> = {
          id,
          key,
          parentKey,
          isExpanded,
          childRows,
          level,
          posInSet,
          startRowIndex,
          setSize: keys.length
        };
        flattenedRows.push(groupRow);
        allGroupRows.add(groupRow);

        if (isExpanded) {
          flattenedRows.push(...expandGroup(childGroups, id, level + 1));
        }
      });

      return flattenedRows;
    };

    return [expandGroup(groupedRows, undefined, 0), allGroupRows];
  }, [expandedGroupIds, groupedRows, rawRows]);

  const isGroupRow = <R>(row: unknown): row is GroupRow<R> => {
    return allGroupRows.has(row);
  };

  const [rowOverscanStartIdx, rowOverscanEndIdx] = getVerticalRangeToRender(
    clientHeight,
    rowHeight,
    scrollTop,
    rows.length
  );

  return {
    rowOverscanStartIdx,
    rowOverscanEndIdx,
    rows,
    rowsCount,
    isGroupRow
  };
}
