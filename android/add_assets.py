import os
import sys
import zipfile

apk = sys.argv[1]
assets = sys.argv[2]

with zipfile.ZipFile(apk, "a", zipfile.ZIP_DEFLATED) as archive:
    count = 0
    for root, _dirs, files in os.walk(assets):
        for name in files:
            full = os.path.join(root, name)
            rel = os.path.relpath(full, assets).replace(os.sep, "/")
            archive.write(full, "assets/" + rel)
            count += 1
print("assets added:", count)
