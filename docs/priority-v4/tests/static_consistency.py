"""Narrow source-shape regression checks, NOT SQL parsing/PostgreSQL validation.
Reads only the five local drafts; no database, credentials or transport imports.
Handles the current CREATE TABLE shape only and refuses unexpected coverage.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1] / 'sql'
NAMES = ['001_registry.sql', '002_canonical_evidence.sql', '003_opportunities.sql', '004_calculations.sql', '005_immutability_projection.sql']

def split_fields(body):
    fields, start, depth, quoted = [], 0, 0, False
    i = 0
    while i < len(body):
        c = body[i]
        if c == "'":
            if quoted and i + 1 < len(body) and body[i + 1] == "'":
                i += 2
                continue
            quoted = not quoted
        if not quoted:
            if c == '(':
                depth += 1
            elif c == ')':
                depth -= 1
            elif c == ',' and depth == 0:
                fields.append(body[start:i].strip())
                start = i + 1
        i += 1
    assert depth == 0 and not quoted, 'unsupported/unbalanced table body'
    return fields + [body[start:].strip()]

def keys(text):
    return tuple(x.strip() for x in text.split(','))

def audit(sqls):
    tables, references, count = {}, [], 0
    for name, sql in sqls:
        creates = list(re.finditer(r'CREATE TABLE public\.(\w+)\s*\((.*?)\n\);', sql, re.S))
        assert len(creates) == len(re.findall(r'CREATE TABLE\b', sql)), name + ': unsupported CREATE shape'
        for m in creates:
            table, body = m.groups()
            columns, unique = {}, set()
            assert table not in tables, 'duplicate table'
            for field in split_fields(body):
                if re.match(r'^(PRIMARY KEY|UNIQUE|FOREIGN KEY|CHECK)\b', field):
                    continue
                column = field.split()[0]
                assert column not in columns, table + ': duplicate column'
                columns[column] = field
                if re.search(r'\b(PRIMARY KEY|UNIQUE)\b', field):
                    unique.add((column,))
                for parent, parent_cols in re.findall(r'REFERENCES public\.(\w+)\(([^)]+)\)', field):
                    references.append((table, (column,), parent, keys(parent_cols)))
            for key in re.findall(r'(?:PRIMARY KEY|UNIQUE)\(([^)]+)\)', body):
                parts = keys(key)
                assert all(c in columns for c in parts), table + ': key names missing column'
                unique.add(parts)
            for local, parent, target in re.findall(r'FOREIGN KEY\(([^)]+)\) REFERENCES public\.(\w+)\(([^)]+)\)', body):
                references.append((table, keys(local), parent, keys(target)))
            tables[table] = (columns, unique)
            after = sql[m.end():]
            assert re.match(r'\s*GRANT\b', after), table + ': missing immediate grant'
            assert f'ALTER TABLE public.{table} ENABLE ROW LEVEL SECURITY;' in after
            count += 1
    assert count == 21, 'unexpected table inventory; review checker coverage'
    for table, local, parent, target in references:
        assert all(c in tables[table][0] for c in local), table + ': missing FK column'
        assert parent in tables, table + ': missing referenced table'
        assert all(c in tables[parent][0] for c in target), table + ': missing parent column'
        assert target in tables[parent][1], table + ': referenced tuple is not unique'
        assert len(local) == len(target), table + ': FK arity mismatch'
    # Current only explicit data INSERT is the publisher; dynamic DDL is separately reviewed.
    inserts = re.findall(r'INSERT INTO public\.(\w+)\(([^)]+)\)', '\n'.join(s for _, s in sqls))
    assert len(inserts) == 1, 'unexpected INSERT inventory'
    for table, names in inserts:
        supplied = keys(names)
        assert all(c in tables[table][0] for c in supplied)
        required = {c for c, definition in tables[table][0].items() if ('NOT NULL' in definition or 'PRIMARY KEY' in definition) and 'DEFAULT' not in definition and 'GENERATED' not in definition}
        assert required <= set(supplied), table + ': required INSERT column omitted'
    return count, len(references), len(inserts)

def main():
    sqls = [(name, (ROOT / name).read_text()) for name in NAMES]
    result = audit(sqls)
    # Positive regression control: re-introducing Phase 6's missing local accepted_at must fail.
    faulty = [(name, sql.replace('UNIQUE(worker_id,booking_id,generation), FOREIGN KEY(worker_id,booking_id,generation) REFERENCES public.v4_assignments(worker_id,booking_id,generation)', 'UNIQUE(worker_id,booking_id,generation), FOREIGN KEY(worker_id,booking_id,generation,accepted_at) REFERENCES public.v4_assignments(worker_id,booking_id,generation,accepted_at)') if name == NAMES[1] else sql) for name, sql in sqls]
    refused = False
    try:
        audit(faulty)
    except AssertionError as error:
        refused = 'missing FK column' in str(error)
    assert refused, 'regression control did not reject missing column'
    print(f'SOURCE_SHAPE_OK tables={result[0]} foreign_keys={result[1]} explicit_inserts={result[2]}')
    print('MISSING_COLUMN_REGRESSION_REJECTED; NO_SQL_PARSE_OR_EXECUTION')

if __name__ == '__main__':
    main()