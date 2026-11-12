# License notices

This example reuses designs, class strings and design tokens from
[shadcn/ui](https://github.com/shadcn-ui/ui), which is published under the
MIT license. The parts that derive from it:

- The Tailwind class strings in every template in `src/components/` and in
  `buttonVariants` and `badgeVariants` in `src/lib/index.ts`.
- The color and radius tokens in `src/styles/tokens.css`.
- The component names, part names, `data-slot` values and prop names
  (`variant`, `size`, `defaultValue`, `onValueChange`, `onOpenChange` and the
  like), which follow shadcn/ui's API.
- The component descriptions taken from shadcn/ui's documentation: the
  `description` of `Accordion`, `Alert`, `Badge`, `Button`, `Switch` and
  `Tabs` in `src/components/`.
- The story content in `preview/stories/` that mirrors shadcn/ui's own
  examples, such as the "Edit profile" dialog. The names in it are
  placeholders.

The template structure, the shared helpers' code and the preview setup are
this example's own and fall under the scaffold-ui-kit repository's license.

shadcn/ui's license notice:

```
MIT License

Copyright (c) 2023 shadcn

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
