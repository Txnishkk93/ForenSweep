"use client";

import { useId, useState } from "react";
import type { ReactNode } from "react";

/**
 * Generic "show first N, then expand" wrapper. The caller controls which
 * items are rendered for each state, so table semantics remain intact for
 * <table>/<tbody> callers without duplicating or refetching data.
 *
 * `visibleCount` is the number of items shown collapsed. `totalCount` is the
 * total number of items the caller is rendering as children. If totalCount
 * <= visibleCount, no toggle is rendered at all.
 */
export function ExpandableSection({
  visibleCount,
  totalCount,
  renderListAction,
}: {
  visibleCount: number;
  totalCount: number;
  /**
   * Given expanded state, render the list. Callers slice their own array
   * (e.g. `.slice(0, expanded ? total : 3)`) rather than hiding DOM nodes
   * with CSS, so no data is duplicated and no extra fetches happen.
   */
  renderListAction: (expanded: boolean) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const regionId = useId();

  if (totalCount <= visibleCount) {
    // Nothing to hide — just render the list, no toggle needed.
    return <>{renderListAction(true)}</>;
  }

  return (
    <>
      <div
        id={regionId}
      >
        {renderListAction(expanded)}
      </div>
      <div className="flex items-center justify-end border-t border-hairline px-5 py-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-controls={regionId}
          className="text-[11.5px] font-medium text-ink hover:text-primary-active"
        >
          {expanded ? "Show less ↑" : "View all →"}
        </button>
      </div>
    </>
  );
}