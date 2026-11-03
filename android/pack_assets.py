import os
import sys
import zipfile


def main():
    src, out = sys.argv[1], sys.argv[2]
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        for root, _, files in os.walk(src):
            for name in files:
                path = os.path.join(root, name)
                arc = os.path.relpath(path, src).replace("\\", "/")
                zf.write(path, arc)


if __name__ == "__main__":
    main()
