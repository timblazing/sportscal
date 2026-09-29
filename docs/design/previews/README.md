# Clean design previews

These SVG snapshots show the three pages of `docs/design/sportscal.fig` without OpenPencil's purple component labels and set outlines. The `.fig` file is the editable source.

Regenerate after editing the design:

```sh
openpencil export docs/design/sportscal.fig --page Foundations -f svg -o docs/design/previews/foundations.svg
openpencil export docs/design/sportscal.fig --page Components -f svg -o docs/design/previews/components.svg
openpencil export docs/design/sportscal.fig --page Blocks -f svg -o docs/design/previews/blocks.svg
```
