#!/bin/bash
cd /Users/inancayvaz/2048/designs

GAMES=(wordle 2048 snake minesweeper sudoku pong clicker match3 breakout bubble solitaire geodash crossy jetpack helix stickman hillclimb pool tower flappy)

echo "NAME|COLORS|TYPOGRAPHY|PRIMARY|FONT_FAMILY"
for g in "${GAMES[@]}"; do
  tdir="./$g/$g-design/tokens"
  c="$tdir/colors.json"
  t="$tdir/typography.json"
  if [[ -f "$c" && -f "$t" ]]; then
    primary=$(python3 -c "
import json
d = json.load(open('$c'))
# try common keys
for key in ['primary','brand','accent']:
    if key in d:
        v = d[key]
        if isinstance(v, dict):
            for sk in ['500','DEFAULT','base','main','value']:
                if sk in v:
                    print(v[sk]); break
            else:
                # first string leaf
                for sk,sv in v.items():
                    if isinstance(sv,str):
                        print(sv); break
        else:
            print(v)
        break
else:
    # print first hex
    import re
    s = json.dumps(d)
    m = re.search(r'#[0-9a-fA-F]{3,8}', s)
    print(m.group(0) if m else '?')
" 2>/dev/null || echo "?")
    font=$(python3 -c "
import json
d = json.load(open('$t'))
# family is usually in d['fontFamily'] or d['family'] or nested
import re
s = json.dumps(d)
# look for font family string
keys = ['fontFamily','family','primary','sans','body','base','display','heading']
def find(obj):
    if isinstance(obj,str):
        return obj
    if isinstance(obj,dict):
        for k in keys:
            if k in obj:
                r = find(obj[k])
                if r: return r
        for v in obj.values():
            r = find(v)
            if r and isinstance(r,str): return r
    return None
print((find(d) or '?').split(',')[0].strip().strip('\"'))
" 2>/dev/null || echo "?")
    echo "$g|OK|OK|$primary|$font"
  else
    echo "$g|MISSING|MISSING|?|?"
  fi
done
