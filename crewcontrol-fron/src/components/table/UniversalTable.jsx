import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Divider,
  Table,
  TableBody,
  TableContainer,
} from "@mui/material";

import TableHeader from "./TableHeader";
import TableToolbar from "./TableToolbar";

export default function UniversalTable({
  columns,
  rows,
  renderRow,
  rowsPerPage = 5,
  searchKeys = [],
  searchPlaceholder,
  kpiFilterKey = null,
  filterKey = null,          // ✅ NEW (IMPORTANT)
  enablePagination = true,
  enableScroll = false,
  monthValue,
  onMonthChange,
  containerSx,
  tableSx,
  headerRowSx,
  headerCellSx,
  toolbarRootSx,
  toolbarSearchSx,
  toolbarPaginationTextSx,
  toolbarNavButtonSx,
  // Server-pagination mode (opt-in, backward compatible): when `server`
  // is true, `rows` is already the current page's data (not the full
  // dataset) - search/pagination happen server-side via `onSearchChange`/
  // `onPageChange`, and `total`/`page` are the caller's own state rather
  // than being computed here. Every prop below this point is a no-op
  // unless `server` is set, so every existing (client-side) caller of
  // this component is unaffected. Added for Employees.jsx's main table,
  // which needs to reach records beyond whatever single page is loaded
  // (was previously impossible - both search and pagination only ever
  // saw the one already-fetched, backend-capped page).
  server = false,
  page: controlledPage,
  onPageChange,
  total: controlledTotal,
  search: controlledSearch,
  onSearchChange,
}) {
  const [localSearch, setLocalSearch] = useState("");
  const [localPage, setLocalPage] = useState(1);

  const search = server ? controlledSearch ?? "" : localSearch;
  const setSearch = server ? (onSearchChange || (() => {})) : setLocalSearch;
  const page = server ? controlledPage ?? 1 : localPage;
  const setPage = server ? null : setLocalPage;

  const filteredRows = useMemo(() => {
    if (server) return rows || [];
    let data = rows || [];

    // ✅ KPI FILTER (SAFE + GENERIC)
    if (kpiFilterKey && filterKey) {
      data = data.filter(
        (row) => row[filterKey] === kpiFilterKey
      );
    }

    // ✅ SEARCH FILTER
    if (!search) return data;

    const q = search.toLowerCase();
    return data.filter((row) =>
      searchKeys.some(
        (key) =>
          row[key] &&
          row[key].toString().toLowerCase().includes(q)
      )
    );
  }, [server, rows, search, kpiFilterKey, filterKey, searchKeys]);

  const visibleRows = server
    ? filteredRows
    : enablePagination
      ? filteredRows.slice(
          (page - 1) * rowsPerPage,
          page * rowsPerPage
        )
      : filteredRows;
  const rowOffset = server ? (page - 1) * rowsPerPage : enablePagination ? (page - 1) * rowsPerPage : 0;
  const toolbarTotal = server ? (controlledTotal ?? 0) : filteredRows.length;

  useEffect(() => {
    if (server) return;
    setLocalPage(1);
  }, [server, rows, search]);

  return (
    <TableContainer
      component={Box}
      sx={{
        bgcolor: "var(--bg-surface)",
        border: "1px solid",
        borderColor: "var(--border-card)",
        borderRadius: 1,
        overflow: enableScroll ? "auto" : "hidden",
        maxHeight: enableScroll ? 420 : "unset",
        ...containerSx,
      }}
    >
      <TableToolbar
        search={search}
        onSearch={setSearch}
        searchPlaceholder={searchPlaceholder}
        page={page}
        rowsPerPage={rowsPerPage}
        total={toolbarTotal}
        pagination={enablePagination}
        onPrev={() => (server ? onPageChange?.(Math.max(1, page - 1)) : setPage((p) => Math.max(1, p - 1)))}
        onNext={() => (server ? onPageChange?.(page + 1) : setPage((p) => p + 1))}
        monthValue={monthValue}
        onMonthChange={onMonthChange}
        rootSx={toolbarRootSx}
        searchSx={toolbarSearchSx}
        paginationTextSx={toolbarPaginationTextSx}
        navButtonSx={toolbarNavButtonSx}
      />

      <Divider sx={{ borderColor: "var(--border-card)" }} />

      <Table stickyHeader={enableScroll} sx={tableSx}>
        <TableHeader columns={columns} rowSx={headerRowSx} cellSx={headerCellSx} />
        <TableBody>
          {visibleRows.map((row, index) => renderRow(row, index, rowOffset))}
        </TableBody>
      </Table>
    </TableContainer>
  );
}

