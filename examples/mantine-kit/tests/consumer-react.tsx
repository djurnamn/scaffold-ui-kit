// How a strict React consumer sees the kit. `npm run typecheck:consumer` compiles it.
import { useRef } from 'react';
import { Button, NumberInput, TextInput, type ButtonProps } from '../dist/react';

export function Consumer(props: ButtonProps) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button {...props} size="lg" color="grape" variant="light" radius="xl">
        Save
      </Button>
      {/* @ts-expect-error an unknown size */}
      <Button size="huge">No</Button>
      {/* @ts-expect-error an unknown color */}
      <Button color="pink">No</Button>
      <TextInput
        ref={input}
        label="Email"
        error="Required"
        classNames={{ input: 'x' }}
        styles={{ input: { '--input-radius': '0px' } }}
        onValueChange={(value: string) => value.trim()}
      />
      {/* @ts-expect-error classNames is keyed by part name */}
      <TextInput classNames={{ nope: 'x' }} />
      <NumberInput label="Qty" min={0} max={5} />
    </>
  );
}
