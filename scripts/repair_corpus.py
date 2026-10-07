import sqlite3
import re
import sys

sys.stdout.reconfigure(encoding='utf-8')

# High quality IAST to Devanagari transliterator
INDEPENDENT_VOWELS = {
    'ai': 'ऐ', 'au': 'औ', 'ā': 'आ', 'a': 'अ',
    'ī': 'ई', 'i': 'इ', 'ū': 'ऊ', 'u': 'उ',
    'ṝ': 'ॠ', 'ṛ': 'ऋ', 'ḷ': 'ऌ', 'e': 'ए', 'o': 'ओ'
}

DEPENDENT_VOWELS = {
    'ai': 'ै', 'au': 'ौ', 'ā': 'ा', 'a': '',
    'ī': 'ी', 'i': 'ि', 'ū': 'ू', 'u': 'ु',
    'ṝ': 'ॄ', 'ṛ': 'ृ', 'ḷ': 'ॢ', 'e': 'े', 'o': 'ो'
}

CONSONANTS = {
    'kh': 'ख्', 'gh': 'घ्', 'ch': 'छ्', 'jh': 'झ्',
    'ṭh': 'ठ्', 'ḍh': 'ढ्', 'th': 'थ्', 'dh': 'ध्',
    'ph': 'फ्', 'bh': 'भ्',
    'k': 'क्', 'g': 'ग्', 'ṅ': 'ङ्',
    'c': 'च्', 'j': 'ज्', 'ñ': 'ञ्',
    'ṭ': 'ट्', 'ḍ': 'ड्', 'ṇ': 'ण्',
    't': 'त्', 'd': 'द्', 'n': 'न्',
    'p': 'प्', 'b': 'ब्', 'm': 'म्',
    'y': 'य्', 'r': 'र्', 'l': 'ल्', 'v': 'व्',
    'ś': 'श्', 'ṣ': 'ष्', 's': 'स्', 'h': 'ह्'
}

def iast_to_devanagari(text: str) -> str:
    if not text:
        return ""
    lines = text.split('\n')
    out_lines = []
    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            out_lines.append("")
            continue
        
        # Check if line is verse numbers or special
        res = []
        i = 0
        n = len(line_clean)
        last_was_consonant_virama = False

        while i < n:
            ch = line_clean[i]

            # Whitespace & punctuation
            if ch in ' \t-,:;!?"\'’“”':
                if ch in '\'’':
                    res.append('ऽ')
                    i += 1
                    last_was_consonant_virama = False
                    continue
                res.append(ch)
                i += 1
                last_was_consonant_virama = False
                continue

            if line_clean[i:i+2] == '||':
                res.append('॥')
                i += 2
                last_was_consonant_virama = False
                continue
            if ch == '|':
                res.append('।')
                i += 1
                last_was_consonant_virama = False
                continue

            # Digits
            if ch.isdigit():
                dev_digits = '०१२३४५६७८९'
                res.append(dev_digits[int(ch)])
                i += 1
                last_was_consonant_virama = False
                continue

            # Anusvara & Visarga
            if ch in ('ṁ', 'ṃ'):
                if last_was_consonant_virama and res and res[-1].endswith('्'):
                    # remove virama before anusvara
                    res[-1] = res[-1][:-1]
                res.append('ं')
                i += 1
                last_was_consonant_virama = False
                continue
            if ch == 'ḥ':
                res.append('ः')
                i += 1
                last_was_consonant_virama = False
                continue

            # Multi-character consonant check
            matched_cons = None
            for c_key in ['kh', 'gh', 'ch', 'jh', 'ṭh', 'ḍh', 'th', 'dh', 'ph', 'bh',
                          'k', 'g', 'ṅ', 'c', 'j', 'ñ', 'ṭ', 'ḍ', 'ṇ', 't', 'd', 'n',
                          'p', 'b', 'm', 'y', 'r', 'l', 'v', 'ś', 'ṣ', 's', 'h']:
                if line_clean[i:i+len(c_key)].lower() == c_key:
                    matched_cons = c_key
                    break

            if matched_cons:
                res.append(CONSONANTS[matched_cons])
                i += len(matched_cons)
                last_was_consonant_virama = True
                continue

            # Vowel check
            matched_vowel = None
            for v_key in ['ai', 'au', 'ā', 'a', 'ī', 'i', 'ū', 'u', 'ṝ', 'ṛ', 'ḷ', 'e', 'o']:
                if line_clean[i:i+len(v_key)].lower() == v_key:
                    matched_vowel = v_key
                    break

            if matched_vowel:
                if last_was_consonant_virama and res and res[-1].endswith('्'):
                    # Drop virama and append dependent vowel matra
                    res[-1] = res[-1][:-1] + DEPENDENT_VOWELS[matched_vowel]
                else:
                    res.append(INDEPENDENT_VOWELS[matched_vowel])
                i += len(matched_vowel)
                last_was_consonant_virama = False
                continue

            # Fallback for unrecognized character
            res.append(ch)
            i += 1
            last_was_consonant_virama = False

        out_lines.append("".join(res))

    return "\n".join(out_lines)


def repair():
    db_path = 'database/prabhupada_corpus.db'
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    print(f"Applying comprehensive corpus repairs on {db_path}...")

    # 1. Fix BG-4-5
    target_end_bg45 = "The demons cannot adjust themselves to this transcendental nature of the Lord, which the Lord Himself explains in the following verse."
    c.execute("SELECT Purports FROM Records WHERE RecordKey = 'BG-4-5'")
    row = c.fetchone()
    if row and target_end_bg45 in row[0]:
        idx = row[0].find(target_end_bg45) + len(target_end_bg45)
        clean_bg45 = row[0][:idx].strip()
        c.execute("UPDATE Records SET Purports = ? WHERE RecordKey = 'BG-4-5'", (clean_bg45,))
        print("✓ BG-4-5 purport cleanly truncated at true verse boundary")

    # 2. Fix BG-9-33
    target_end_bg933 = "Everyone should therefore take to Kṛṣṇa consciousness and make his life perfect."
    c.execute("SELECT Purports FROM Records WHERE RecordKey = 'BG-9-33'")
    row = c.fetchone()
    if row and target_end_bg933 in row[0]:
        idx = row[0].find(target_end_bg933) + len(target_end_bg933)
        clean_bg933 = row[0][:idx].strip()
        c.execute("UPDATE Records SET Purports = ? WHERE RecordKey = 'BG-9-33'", (clean_bg933,))
        print("✓ BG-9-33 purport cleanly truncated at true verse boundary")

    # 3. Fix BG-13-33
    target_end_bg1333 = "No one in science can ascertain this."
    c.execute("SELECT Purports FROM Records WHERE RecordKey = 'BG-13-33'")
    row = c.fetchone()
    if row and target_end_bg1333 in row[0]:
        idx = row[0].find(target_end_bg1333) + len(target_end_bg1333)
        clean_bg1333 = row[0][:idx].strip()
        c.execute("UPDATE Records SET Purports = ? WHERE RecordKey = 'BG-13-33'", (clean_bg1333,))
        print("✓ BG-13-33 purport cleanly truncated at true verse boundary")

    # 4. Fix SB-10.8-28
    sb10_8_28_dev = """कृष्णस्य गोप्यो रुचिरं
वीक्ष्य कौमारचापलम्
शृण्वन्त्याः किल तन्मातुर्
इति होचुः समागताः"""
    sb10_8_28_trans = """kṛṣṇasya gopyo ruciraṁ
vīkṣya kaumāra-cāpalam
śṛṇvantyāḥ kila tan-mātur
iti hocuḥ samāgatāḥ"""
    c.execute("UPDATE Records SET Devanagari = ?, Transliteration = ? WHERE RecordKey = 'SB-10.8-28'",
              (sb10_8_28_dev, sb10_8_28_trans))
    print("✓ SB-10.8-28 restored clean Devanagari and Transliteration")

    # 5. Fix SB-10.11-21
    sb10_11_21_dev = """श्रीशुक उवाच
गोपवृद्धा महोत्पातान्
अनुभूय बृहद्वने
नन्दादयः समागम्य
व्रजकार्यम् अमन्त्रयन्"""
    sb10_11_21_trans = """śrī-śuka uvāca
gopa-vṛddhā mahotpātān
anubhūya bṛhadvane
nandādayaḥ samāgamya
vraja-kāryam amantrayan"""
    c.execute("UPDATE Records SET Devanagari = ?, Transliteration = ? WHERE RecordKey = 'SB-10.11-21'",
              (sb10_11_21_dev, sb10_11_21_trans))
    print("✓ SB-10.11-21 restored clean Devanagari and Transliteration")

    # 6. Fix SB-10.53-10
    sb10_53_10_dev = """पितॄन् देवान् समभ्यर्च्य
विप्रांश् च विधिवन् नृप ।
भोजयित्वा यथा-न्यायं
वाचयाम् आस मङ्गलम् ॥ १० ॥"""
    sb10_53_10_trans = """pitṝn devān samabhyarcya
viprāṁś ca vidhivan nṛpa
bhojayitvā yathā-nyāyaṁ
vācayām āsa maṅgalam"""
    c.execute("UPDATE Records SET Devanagari = ?, Transliteration = ? WHERE RecordKey = 'SB-10.53-10'",
              (sb10_53_10_dev, sb10_53_10_trans))
    print("✓ SB-10.53-10 restored authentic Sanskrit and Devanagari")

    # 7. Fix MADHYA-9-269
    madhya_9_269_dev = """यो दुस्त्यजान् क्षितिसुतस्वजनार्थदारान्
प्रार्थ्यां श्रियं सुरवरैः सदयावलोकाम् ।
नैच्छन् नृपस् तद् उचितं महतां मधुद्विट्-
सेवानुरक्तमनसाम् अभवो ऽपि फल्गुः ॥ २६९ ॥"""
    madhya_9_269_trans = """yo dustyajān kṣiti-suta-svajanārtha-dārān
prārthyāṁ śriyaṁ sura-varaiḥ sadayāvalokām
naicchan nṛpas tad ucitaṁ mahatāṁ madhu-dviṭ-
sevānurakta-manasām abhavo 'pi phalguḥ"""
    c.execute("UPDATE Records SET Devanagari = ?, Transliteration = ? WHERE RecordKey = 'MADHYA-9-269'",
              (madhya_9_269_dev, madhya_9_269_trans))
    print("✓ MADHYA-9-269 restored authentic Devanagari and Transliteration")

    # 8. Fix ANTYA-3-197
    antya_3_197_dev = """त्वत्साक्षात्कारणाह्लाद-
विशुद्धाब्धिस्थितस्य मे ।
सुखानि गोष्पदायन्ते
ब्राह्माण्यापि जगद्गुरो ॥ १९७ ॥"""
    antya_3_197_trans = """tvat-sākṣāt-karaṇāhlāda-
viśuddhābdhi-sthitasya me
sukhāni goṣpadāyante
brāhmāṇy api jagad-guro"""
    c.execute("UPDATE Records SET Devanagari = ?, Transliteration = ? WHERE RecordKey = 'ANTYA-3-197'",
              (antya_3_197_dev, antya_3_197_trans))
    print("✓ ANTYA-3-197 restored authentic Devanagari and Transliteration")

    # 9. Fix Brahma-samhita 5 verses with corrupted Devanagari
    c.execute("SELECT RecordKey, Transliteration, Devanagari FROM Records WHERE BookKey = 'BS'")
    bs_rows = c.fetchall()
    bs_fixed = 0
    for rk, trans, dev in bs_rows:
        if dev and any(sym in dev for sym in ['(', ')', ']', '[', '*', '&', '+']):
            if trans:
                new_dev = iast_to_devanagari(trans)
                c.execute("UPDATE Records SET Devanagari = ? WHERE RecordKey = ?", (new_dev, rk))
                bs_fixed += 1
    print(f"✓ Fixed {bs_fixed} Brahma-samhita 5 verses with pristine Devanagari from IAST")

    # 10. Clean RTF control artifacts in BB (Brihad-bhagavatamrta)
    c.execute("SELECT RecordKey, Devanagari FROM Records WHERE BookKey = 'BB' AND Devanagari LIKE '%लस्त्%'")
    bb_rows = c.fetchall()
    for rk, dev in bb_rows:
        cleaned_dev = re.sub(r'\\?\*?लस्त्[^\s\n]*', '', dev)
        cleaned_dev = re.sub(r'[ \t]{2,}', ' ', cleaned_dev).strip()
        c.execute("UPDATE Records SET Devanagari = ? WHERE RecordKey = ?", (cleaned_dev, rk))
    print(f"✓ Cleaned RTF control code remnants from {len(bb_rows)} BB verses")

    # Clean BB-3.7-43 Devanagari which had English commentary accidentally transliterated
    c.execute("SELECT Transliteration FROM Records WHERE RecordKey = 'BB-3.7-43'")
    bb_trans = c.fetchone()[0]
    # In BB-3.7-43, keep only the actual Sanskrit verse stanzas
    pure_sanskrit_stanzas = []
    for stanza in bb_trans.split('\n\n'):
        # If stanza contains English words like "Even if I offer" or "Bhāgavatam", skip
        if any(w in stanza for w in ['Even', 'offer', 'Bhāgavatam', 'liberated', 'perfection', 'devotional']):
            continue
        pure_sanskrit_stanzas.append(stanza.strip())
    
    clean_bb_trans = "\n\n".join(pure_sanskrit_stanzas)
    clean_bb_dev = iast_to_devanagari(clean_bb_trans)
    c.execute("UPDATE Records SET Devanagari = ? WHERE RecordKey = 'BB-3.7-43'", (clean_bb_dev,))
    print("✓ Cleaned BB-3.7-43 Devanagari")

    conn.commit()

    # Rebuild FTS tables
    print("\nRebuilding SearchIndex and RecordsFts virtual tables...")
    try:
        c.execute("INSERT INTO SearchIndex(SearchIndex) VALUES('rebuild')")
        print("✓ SearchIndex FTS5 rebuild complete")
    except Exception as e:
        print(f"SearchIndex rebuild note: {e}")

    try:
        c.execute("INSERT INTO RecordsFts(RecordsFts) VALUES('rebuild')")
        print("✓ RecordsFts FTS5 rebuild complete")
    except Exception as e:
        print(f"RecordsFts rebuild note: {e}")

    conn.commit()
    conn.close()
    print("\nAll database repairs completed successfully!")

if __name__ == '__main__':
    repair()
