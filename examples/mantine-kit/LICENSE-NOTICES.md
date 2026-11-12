# License notices

This example is inspired by Mantine and reuses values from Mantine's default
theme:

- the color values in `themes/default.css` (the blue, red, green and grape
  shades, and the light and dark scheme colors), with some colors changed so
  text on them meets WCAG AA: blue and grape `filled` are Mantine's shades 8
  and 9 (for rest and hover, two steps darker than its default), red `filled`
  and the light-scheme error color are its shade 9, and the dark-scheme error
  color is its shade 4. The red and green hover colors, green `filled` and
  both `dimmed` colors are this example's own;
- the font size, radius and control height scales in `themes/default.css`,
  which the components read through their `size` and `radius` props;
- the names of the component props and of the inner parts the Styles API
  targets, which follow Mantine's.

The template structure in `src/components/`, the helpers in
`src/template-helpers/` and the preview setup are this example's own and fall
under the scaffold-ui-kit repository's license.

Mantine's values are used under its MIT license:

```
MIT License

Copyright (c) 2021 Vitaly Rtishchev

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
