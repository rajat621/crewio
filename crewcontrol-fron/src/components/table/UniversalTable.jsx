import { useMemo, useState } from "react";
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
  containerSx,
  tableSx,
  headerRowSx,
  headerCellSx,
  toolbarRootSx,
  toolbarSearchSx,
  toolbarPaginationTextSx,
  toolbarNavButtonSx,
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filteredRows = useMemo(() => {
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
  }, [rows, search, kpiFilterKey, filterKey, searchKeys]);

  const visibleRows = enablePagination
    ? filteredRows.slice(
        (page - 1) * rowsPerPage,
        page * rowsPerPage
      )
    : filteredRows;
  const rowOffset = enablePagination ? (page - 1) * rowsPerPage : 0;

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
        total={filteredRows.length}
        pagination={enablePagination}
        onPrev={() => setPage((p) => Math.max(1, p - 1))}
        onNext={() => setPage((p) => p + 1)}
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

