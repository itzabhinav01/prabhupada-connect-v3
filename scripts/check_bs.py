import sqlite3
import sys

sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('database/prabhupada_corpus.db')
c = conn.cursor()

c.execute("SELECT RecordKey, Reference, Devanagari, Transliteration FROM Records WHERE BookKey = 'BS' ORDER BY Sequence")
for rk, ref, dev, trans in c.fetchall():
    if dev and any(ch in dev for ch in ['(', ')', ']', '[', '*', '&', '+']):
        print('='*40)
        print(rk, ref)
        print('DEV:', repr(dev))
        print('TRANS:', repr(trans) if trans else None)

conn.close()
