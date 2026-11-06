#!/usr/bin/env python3
"""Print one worksheet of an Excel file as JSON, for the Node data scripts.

    python3 scripts/lib/sheet2json.py FILE [SHEET]

Output: {"sheets": [...names], "sheet": "chosen", "rows": [[cell, ...], ...]}
Cells are numbers, strings or null. Dates become "YYYY-MM-DD" strings.
.xls needs the xlrd package, .xlsx needs openpyxl (the workflows install both).
If SHEET is missing or not found, the first sheet whose name contains "data" is used, else the first sheet.
"""
import datetime
import json
import sys


def pick(names, wanted):
    if wanted and wanted in names:
        return wanted
    for n in names:
        if 'data' in n.lower():
            return n
    return names[0]


def cell(v):
    if v is None:
        return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime('%Y-%m-%d')
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (int, float)):
        return v
    s = str(v).strip()
    return s or None


def read_xlsx(path, wanted):
    import openpyxl
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    name = pick(wb.sheetnames, wanted)
    rows = [[cell(v) for v in row] for row in wb[name].iter_rows(values_only=True)]
    return wb.sheetnames, name, rows


def read_xls(path, wanted):
    import xlrd
    wb = xlrd.open_workbook(path)
    names = wb.sheet_names()
    name = pick(names, wanted)
    sh = wb.sheet_by_name(name)
    rows = []
    for r in range(sh.nrows):
        out = []
        for c in range(sh.ncols):
            x = sh.cell(r, c)
            if x.ctype == xlrd.XL_CELL_DATE:
                try:
                    out.append(xlrd.xldate.xldate_as_datetime(x.value, wb.datemode).strftime('%Y-%m-%d'))
                    continue
                except Exception:
                    pass
            if x.ctype in (xlrd.XL_CELL_EMPTY, xlrd.XL_CELL_BLANK, xlrd.XL_CELL_ERROR):
                out.append(None)
            else:
                out.append(cell(x.value))
        rows.append(out)
    return names, name, rows


def main():
    if len(sys.argv) < 2:
        sys.exit('usage: sheet2json.py FILE [SHEET]')
    path, wanted = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
    with open(path, 'rb') as f:
        head = f.read(8)
    # .xlsx files are zip archives ("PK"); old .xls files are OLE2 compound documents.
    names, name, rows = (read_xlsx if head[:2] == b'PK' else read_xls)(path, wanted)
    while rows and all(v is None for v in rows[-1]):
        rows.pop()
    json.dump({'sheets': names, 'sheet': name, 'rows': rows}, sys.stdout, separators=(',', ':'))


if __name__ == '__main__':
    main()
