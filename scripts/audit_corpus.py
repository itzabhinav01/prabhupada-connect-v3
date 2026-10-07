import sqlite3
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

def audit():
    db_path = 'database/prabhupada_corpus.db'
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    print(f"Auditing {db_path}...")
    c.execute("SELECT count(*) FROM Records")
    total_records = c.fetchone()[0]
    print(f"Total records in database: {total_records}")

    # Check 1: Audio in Purports
    c.execute("SELECT RecordKey, BookKey, Reference, Purports FROM Records WHERE Purports LIKE '%Audio%'")
    audio_rows = c.fetchall()
    print(f"\n--- Records with 'Audio' in Purports ({len(audio_rows)}) ---")
    for rk, bk, ref, purport in audio_rows:
        print(f"  {rk} ({ref}): purport len = {len(purport)}")
        pos = purport.find('Audio')
        snippet = purport[max(0, pos-80):min(len(purport), pos+100)]
        print(f"    Snippet: {snippet!r}")

    # Check 2: Legacy font pattern '))' (from '|| 1 ||' in legacy font)
    c.execute("SELECT RecordKey, BookKey, Reference, Purports FROM Records WHERE Purports LIKE '%))%'")
    double_paren_purports = c.fetchall()
    print(f"\n--- Records with '))' in Purports ({len(double_paren_purports)}) ---")
    for rk, bk, ref, purport in double_paren_purports:
        pos = purport.find('))')
        snippet = purport[max(0, pos-100):min(len(purport), pos+100)]
        print(f"  {rk} ({ref}):\n    {snippet!r}")

    # Check 3: Legacy font Devanagari in Devanagari column!
    # Valid devanagari unicode range is \u0900-\u097F.
    # If Devanagari has ascii characters (A-Z, a-z), it might be raw legacy font!
    c.execute("SELECT RecordKey, BookKey, Reference, Devanagari FROM Records WHERE Devanagari IS NOT NULL AND length(Devanagari) > 0")
    dev_rows = c.fetchall()
    corrupt_dev = []
    for rk, bk, ref, dev in dev_rows:
        ascii_letters = [ch for ch in dev if ch.isascii() and ch.isalpha()]
        if len(ascii_letters) > 10:
            corrupt_dev.append((rk, bk, ref, len(ascii_letters), dev[:60]))

    print(f"\n--- Records with ASCII letters in Devanagari column ({len(corrupt_dev)}) ---")
    for rk, bk, ref, count, snippet in corrupt_dev[:30]:
        print(f"  {rk} ({ref}): {count} ascii letters: {snippet!r}")

    # Check 5: Balaram/ScaGoudy font patterns
    patterns = ['_iPa', 'SaṁVYa', '>aUTaa', 'Pa[k', 'MaNMaNaa', 'YaQaa', 'SaM>ava', 'MaaMaev', '+ae\\a', 'Maqṅrae']
    print("\n--- Scanning for specific legacy font markers ---")
    for p in patterns:
        c.execute("SELECT RecordKey, Reference FROM Records WHERE Purports LIKE ? OR Devanagari LIKE ? OR Transliteration LIKE ? OR Translation LIKE ?",
                  (f'%{p}%', f'%{p}%', f'%{p}%', f'%{p}%'))
        rows = c.fetchall()
        if rows:
            print(f"  Pattern {p!r}: {rows}")

    # Check 6: Check for any Purport containing the reference of another record in the SAME book
    # e.g. Record BG-4-5 containing "Bg 4.6"
    print("\n--- Checking for merged subsequent verses in purports ---")
    c.execute("SELECT RecordKey, BookKey, Reference, Purports FROM Records WHERE Purports IS NOT NULL AND length(Purports) > 100")
    records = c.fetchall()
    merged_suspects = []
    for rk, bk, ref, purport in records:
        if not ref:
            continue
        # Check if purport contains something like "\nBg X.Y\n" or "\nSB X.Y.Z\n"
        # Match pattern: newline, book abbr, space, number
        matches = re.findall(r'\n([A-Z][a-zA-Z\.\-]*\s+\d+[\.\d\w\-]*)', purport)
        for m in matches:
            m_clean = m.strip()
            # If it looks like a verse reference header
            if m_clean != ref and len(m_clean) < 25:
                # Check if this m_clean actually exists as a Reference in Records
                c.execute("SELECT RecordKey FROM Records WHERE Reference = ? OR Reference = ?", (m_clean, m_clean.replace('.', ' ')))
                target = c.fetchone()
                if target:
                    merged_suspects.append((rk, ref, m_clean, target[0]))

    print(f"Found {len(merged_suspects)} suspects of merged subsequent verses:")
    for src_rk, src_ref, embedded_ref, target_rk in merged_suspects:
        print(f"  In {src_rk} ({src_ref}) -> embedded: {embedded_ref} (which is {target_rk})")


    # Check 7: Deep field audit for abnormal symbols or font remnants
    print("\n--- Deep field audit across Transliteration, Synonyms, and Translation ---")
    c.execute("SELECT RecordKey, Reference, Transliteration FROM Records WHERE Transliteration IS NOT NULL")
    bad_trans = []
    for rk, ref, t in c.fetchall():
        if re.search(r'[><&%$\#@~_\^\|]', t):
            bad_trans.append((rk, ref, t[:50]))
    print(f"Transliterations with unusual symbol artifacts: {len(bad_trans)}")
    for x in bad_trans[:10]:
        print(f"  {x[0]} ({x[1]}): {x[2]!r}")

    c.execute("SELECT RecordKey, Reference, Synonyms FROM Records WHERE Synonyms IS NOT NULL")
    bad_syn = []
    for rk, ref, s in c.fetchall():
        if re.search(r'AJaae|MaNMaNaa|YaQaa|>aUTaa|Pa\[k|SaM>ava', s):
            bad_syn.append((rk, ref, s[:50]))
    print(f"Synonyms with legacy font artifacts: {len(bad_syn)}")
    for x in bad_syn:
        print(f"  {x[0]} ({x[1]}): {x[2]!r}")

    # Check 8: Check all books for embedded self-references or missing fields
    print("\n--- Book-by-book audit for BG, SB, CC, and other books ---")
    c.execute("SELECT BookKey, count(*) FROM Records GROUP BY BookKey ORDER BY BookKey")
    books = c.fetchall()
    print(f"Total books in DB: {len(books)}")

    all_corruptions = []
    c.execute("SELECT RecordKey, BookKey, Reference, Devanagari, Transliteration, Synonyms, Translation, Purports FROM Records")
    for rk, bk, ref, dev, trans, syn, trl, purp in c.fetchall():
        # Check if purports have raw legacy font lines
        if purp:
            for line in purp.split('\n'):
                line_s = line.strip()
                if line_s.startswith(f"{bk} ") or (bk == 'BG' and line_s.startswith('Bg ')) or (bk.startswith('SB') and line_s.startswith('SB ')):
                    if ref and line_s != ref and not line_s.startswith(f"{ref}:"):
                        all_corruptions.append((rk, bk, ref, f"embedded reference line: {line_s}"))
                if 'Audio' in line_s and len(line_s) < 15:
                    all_corruptions.append((rk, bk, ref, f"stray audio line: {line_s}"))

    print(f"Total corruptions detected: {len(all_corruptions)}")
    for corr in all_corruptions:
        print(f"  {corr[0]} ({corr[2]}): {corr[3]}")

    conn.close()

if __name__ == '__main__':
    audit()
