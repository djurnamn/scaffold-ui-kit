/**
 * What `add` writes: every file a run copies or generates, where the
 * layout (or the ledger, for a file already copied) puts it, and its
 * content with every import between copies rewritten. `status` and
 * `update` plan the same way with the settings each copy was written with,
 * so "what add writes today" has one definition.
 */
import { extname, posix } from 'node:path';

import { isText } from './kit.mjs';
import { defaultOwn, expandPattern, sharedDefaultPath } from './settings.mjs';
import {
  findSpecifiers,
  isRelative,
  moduleSpecifier,
  relativeSpecifier,
  replaceSpecifiers,
  stylesheetSpecifier,
} from './specifiers.mjs';
import { relinkStylesheet } from './stylesheet-link.mjs';

/** The values `--stylesheet-link` takes; the first is the default. */
export const stylesheetLinks = ['component', 'none'];

/** Whether a kit and a target leave nothing to import: every piece is copied. */
function ownsEverything(kit, target) {
  return kit.ownsEverything || target === 'html';
}

/**
 * Whether a part is copied with its root: under full ownership, or when the
 * package publishes no import for it. What `add <root>` brings is what
 * `update <root>` covers.
 *
 * @param {import('./kit.mjs').Kit} kit
 * @param {string} target
 * @param {string} part - The part's component name.
 * @returns {boolean}
 */
export function partComesWithRoot(kit, target, part) {
  return (
    ownsEverything(kit, target) ||
    kit.filesOf(part, target)?.component.import === undefined
  );
}

/**
 * What a run owns, after the kit and the target have their say: a kit
 * built for full ownership and the html target, which has no module to
 * import from, own everything.
 *
 * @param {import('./kit.mjs').Kit} kit
 * @param {string} target
 * @param {string[]} own - What the consumer asked to own.
 */
export function ownershipOf(kit, target, own) {
  const everything = ownsEverything(kit, target);
  const list = everything ? [...defaultOwn] : [...own];
  const sharedModuleNames = (kit.manifest.shared ?? []).map(
    (sharedModule) => sharedModule.name
  );
  const askedForLess =
    !own.includes('component') ||
    !own.includes('stylesheet') ||
    (!own.includes('shared') &&
      sharedModuleNames.some((name) => !own.includes(`shared:${name}`)));
  return {
    everything,
    /** Why everything is owned, when the consumer asked for less. */
    reason:
      everything && askedForLess
        ? kit.ownsEverything
          ? `${kit.name} is built for full ownership, so every piece is copied whatever 'own' says.`
          : 'The html target has no module to import from, so every piece is copied.'
        : undefined,
    component: list.includes('component'),
    stylesheet: list.includes('stylesheet'),
    sharedModule: (name) =>
      list.includes('shared') || list.includes(`shared:${name}`),
    list,
  };
}

/**
 * Plans a run.
 *
 * @param {object} options
 * @param {import('./kit.mjs').Kit} options.kit
 * @param {string} options.target
 * @param {object} options.layout - The resolved layout.
 * @param {Record<string, string>} [options.alias]
 * @param {string[]} options.own - What the consumer asked to own.
 * @param {'component' | 'none'} options.stylesheetLink
 * @param {string[]} options.requested - Component names.
 * @param {import('./ledger.mjs').Ledger} options.ledger
 * @param {string[]} [options.sharedFiles] - Shared-module files to plan
 *   whether or not this run reaches them, by kit path: the copies `status`
 *   and `update` check.
 * @param {Record<string, string>} [options.currentSharedLayout] - The
 *   `layout.shared` of the consumer's settings today, for a shared module
 *   the recorded layout predates: the layout places new files.
 * @param {boolean} [options.widenKept] - Whether a composed component's
 *   copy already present follows this run's wider ownership: one written
 *   without a shared module this run owns is planned again in its recorded
 *   form, so its imports reach the module's copies and the files it reaches
 *   come along. `add` passes it; `status` and `update` plan each copy with
 *   the settings it was written with.
 * @returns {object} The planned files (each built by `build()`), the
 *   ledger paths the run removes, the copies already present it relies on
 *   (`kept`), the components the run names (`named`: those asked for and
 *   the parts their roots bring), and notes and warnings to print.
 */
export function planCopies(options) {
  const { kit, target, layout, alias, stylesheetLink, requested, ledger } =
    options;
  const owns = ownershipOf(kit, target, options.own);
  const sharedModuleNames = (kit.manifest.shared ?? []).map(
    (sharedModule) => sharedModule.name
  );
  /** Whether this run owns a shared module a copy's recorded settings did not. */
  const widens = (entry) => {
    if (options.widenKept !== true) return false;
    const recorded = entry.settings?.own ?? [];
    return sharedModuleNames.some(
      (name) =>
        owns.sharedModule(name) &&
        !recorded.includes('shared') &&
        !recorded.includes(`shared:${name}`)
    );
  };
  const notes = [];
  const warnings = [];
  const planned = new Map();
  const requestedSet = new Set(requested);
  // The components this run names: those asked for, and the parts a named
  // root brings with it. What `--force` replaces is theirs.
  const named = new Set(requested);
  for (const name of requested) {
    for (const part of kit.component(name)?.parts ?? []) {
      if (partComesWithRoot(kit, target, part)) named.add(part);
    }
  }
  const ledgerEntries = ledger.entries();
  const forTarget = (entry) => entry.settings?.target === target;
  const copiedComponents = new Set(
    ledgerEntries
      .filter(([, entry]) => entry.piece === 'component' && forTarget(entry))
      .map(([, entry]) => entry.component)
  );
  // A component with a copy or a re-export module for the target is
  // present: a component that imports it uses what is there, and only
  // naming it changes its form.
  const presentComponents = new Set(
    ledgerEntries
      .filter(
        ([, entry]) =>
          ['component', 're-export'].includes(entry.piece) && forTarget(entry)
      )
      .map(([, entry]) => entry.component)
  );
  const existingPath = (match) =>
    ledgerEntries.find(([, entry]) => match(entry))?.[0];

  const plan = (file) => {
    if (!planned.has(file.path)) planned.set(file.path, file);
    return file.path;
  };
  /**
   * A kept copy's marks: `kept`, and the stylesheet link it was written
   * with, which its content and its ledger entry keep.
   */
  const keptFields = (keptLink) =>
    keptLink === undefined
      ? { kept: false }
      : { kept: true, stylesheetLink: keptLink };

  /** Where a component's piece goes: where it already is, or the layout's place. */
  const componentPath = (name, piece) => {
    const existing = existingPath(
      (entry) =>
        entry.component === name && entry.piece === piece && forTarget(entry)
    );
    if (existing !== undefined) return existing;
    const component = kit.component(name);
    const files = kit.filesOf(name, target);
    const pattern =
      piece === 'stylesheet'
        ? layout.stylesheet
        : component.partOf !== undefined
          ? layout.part
          : layout.component;
    return expandPattern(pattern, {
      name,
      'kebab-name': component.kebabName,
      component: component.partOf ?? name,
      extension:
        piece === 're-export' ? 'ts' : extname(files.component.path).slice(1),
      'stylesheet-extension':
        files.stylesheet !== undefined
          ? extname(files.stylesheet.path).slice(1)
          : 'css',
    });
  };

  /** Where a shared module's file goes. */
  const sharedPath = (sharedModule, file) => {
    const existing = existingPath(
      (entry) => entry.layer === sharedModule.name && entry.source === file.path
    );
    if (existing !== undefined) return existing;
    // A module the recorded layout does not name, one a later kit version
    // added, goes where add places a module no layout key names.
    const base =
      layout.shared?.[sharedModule.name] ??
      options.currentSharedLayout?.[sharedModule.name] ??
      sharedDefaultPath(layout.component, sharedModule);
    return file.path === sharedModule.source
      ? base
      : posix.join(base, posix.relative(sharedModule.source, file.path));
  };

  const removals = new Set();
  // Helper files a narrowed component no longer reaches, which another
  // component still does: the component leaves the entry, the file stays.
  const releases = [];
  const helpers = new Map();

  /**
   * Plans a helper: one file per kit path, whichever components reach it,
   * where it already is or at the place the first copy that reaches it
   * gives.
   */
  const planHelper = (name, source, place, isRequested, keptLink) => {
    const existing = helpers.get(source);
    if (existing !== undefined) {
      existing.components.add(name);
      existing.named ||= named.has(name);
      return;
    }
    const recorded = ledgerEntries.find(
      ([, entry]) =>
        entry.piece === 'helper' && entry.source === source && forTarget(entry)
    );
    const file = {
      path: recorded?.[0] ?? place,
      piece: 'helper',
      components: new Set([
        ...helperOwners(recorded?.[1]).filter((owner) =>
          presentComponents.has(owner)
        ),
        name,
      ]),
      source,
      requested: isRequested,
      named: named.has(name),
      ...keptFields(keptLink),
      make: (context) =>
        context.rewrite(kit.read(source), source, context.path),
    };
    helpers.set(source, file);
    plan(file);
  };

  /**
   * Plans a copied stylesheet, and beside it the kit's layer order module
   * when the stylesheet loads it, as a helper the stylesheet's component
   * owns: the copy loads it where the kit's stylesheet did, so its order
   * statement compiles ahead of what the other modules it loads emit.
   */
  const planStylesheet = (name, files, isRequested, keptLink) => {
    const path = plan({
      path: componentPath(name, 'stylesheet'),
      piece: 'stylesheet',
      component: name,
      source: files.stylesheet.path,
      requested: isRequested,
      named: named.has(name),
      ...keptFields(keptLink),
      make: (context) =>
        ownedLayer(
          kit,
          context.rewrite(
            kit.read(files.stylesheet.path),
            files.stylesheet.path,
            context.path
          )
        ),
    });
    const orderModule = kit.layerOrderModule;
    if (
      orderModule !== undefined &&
      (files.stylesheet.imports ?? []).some(
        (specifier) =>
          resolveSpecifier(kit, files.stylesheet.path, specifier, 'style')
            ?.path === orderModule.path
      )
    ) {
      planHelper(
        name,
        orderModule.path,
        posix.join(posix.dirname(path), posix.basename(orderModule.path)),
        isRequested,
        keptLink
      );
    }
  };
  const queue = requested.map((name) => ({ name, requested: true }));
  const processed = new Set();
  const kept = [];

  while (queue.length > 0) {
    // A copy present that follows this run's wider ownership is planned in
    // its recorded form, `kept` naming it: a component copy stays one, a
    // re-export module stays one, its stylesheet is copied when it was, and
    // it links the stylesheet as it was written to.
    const {
      name,
      requested: isRequested,
      kept: keptForm,
      stylesheetLink: keptLink,
    } = queue.shift();
    if (processed.has(name)) continue;
    processed.add(name);
    const component = kit.component(name);
    const files = kit.filesOf(name, target);
    if (files === undefined) {
      if (isRequested) {
        throw new Error(`${name} is not built for ${target}.`);
      }
      warnings.push(`${name} is not built for ${target}; left out`);
      continue;
    }
    const isKept = keptForm !== undefined;
    const copyComponent = isKept
      ? keptForm === 'component'
      : owns.component || files.component.import === undefined;
    const hasStylesheet = files.stylesheet !== undefined;
    const recordedStylesheet =
      isKept &&
      existingPath(
        (entry) =>
          entry.component === name &&
          entry.piece === 'stylesheet' &&
          forTarget(entry)
      ) !== undefined;
    const before = new Set(planned.keys());

    if (copyComponent) {
      const copySheet =
        hasStylesheet &&
        (isKept
          ? recordedStylesheet
          : owns.stylesheet || files.css?.import === undefined);
      const path = plan({
        path: componentPath(name, 'component'),
        piece: 'component',
        component: name,
        source: files.component.path,
        requested: isRequested,
        named: named.has(name),
        ...keptFields(keptLink),
        make: (context) =>
          context.componentContent(context, name, files, copySheet),
      });
      // A helper is one file per kit path, whichever components reach it:
      // where it already is, or beside the first copy that reaches it.
      for (const helper of files.helpers ?? []) {
        planHelper(
          name,
          helper.path,
          posix.normalize(
            posix.join(
              posix.dirname(path),
              posix.relative(posix.dirname(files.component.path), helper.path)
            )
          ),
          isRequested,
          keptLink
        );
      }
      // A component that keeps its styles in its own style block loads the
      // kit's layer order module from beside itself; the copy loads it from
      // beside the copy, a helper as a stylesheet's is.
      const orderModule = kit.layerOrderModule;
      if (
        orderModule !== undefined &&
        (files.component.imports ?? []).some(
          (specifier) =>
            isRelative(specifier) &&
            resolveSpecifier(kit, files.component.path, specifier, 'style')
              ?.path === orderModule.path
        )
      ) {
        planHelper(
          name,
          orderModule.path,
          posix.join(posix.dirname(path), posix.basename(orderModule.path)),
          isRequested,
          keptLink
        );
      }
      if (copySheet) {
        planStylesheet(name, files, isRequested, keptLink);
      }

      // The components it imports come along when the consumer owns
      // components, except a compound's own members, which stay imports
      // from the package unless already copied or asked for.
      for (const source of [files.component, ...(files.helpers ?? [])]) {
        for (const specifier of source.imports ?? []) {
          if (!isRelative(specifier)) continue;
          const resolved = kit.resolveRelative(source.path, specifier, 'code');
          const role = resolved && kit.componentFileAt(resolved, target);
          if (role === undefined || role.component === name) continue;
          if (!['component', 'linked'].includes(role.piece)) continue;
          const dependency = role.component;
          if (requestedSet.has(dependency)) continue;
          if (presentComponents.has(dependency)) {
            const [present, entry] = ledgerEntries.find(
              ([, candidate]) =>
                candidate.component === dependency &&
                ['component', 're-export'].includes(candidate.piece) &&
                forTarget(candidate)
            );
            if (widens(entry)) {
              queue.push({
                name: dependency,
                requested: false,
                kept: entry.piece,
                stylesheetLink:
                  entry.settings?.stylesheetLink ?? stylesheetLinks[0],
              });
            } else if (!kept.includes(present)) {
              kept.push(present);
            }
            continue;
          }
          const importable =
            kit.filesOf(dependency, target)?.component.import !== undefined;
          const sameCompound =
            compoundOf(kit, dependency) !== undefined &&
            compoundOf(kit, dependency) === compoundOf(kit, name);
          if (
            importable &&
            (!owns.component || (sameCompound && !owns.everything))
          )
            continue;
          queue.push({ name: dependency, requested: false });
        }
      }
      // Under full ownership, or for a part with no import, a root's parts
      // come along.
      for (const part of component.parts ?? []) {
        if (partComesWithRoot(kit, target, part)) {
          queue.push({ name: part, requested: false });
        }
      }
    } else if (hasStylesheet && (isKept || owns.stylesheet)) {
      planStylesheet(name, files, isRequested, keptLink);
      plan({
        path: componentPath(name, 're-export'),
        piece: 're-export',
        component: name,
        source: files.component.path,
        requested: isRequested,
        named: named.has(name),
        ...keptFields(keptLink),
        make: (context) => context.reExportContent(context, name, files),
      });
      // The package's component links its own stylesheet, so both load.
      if (isRequested && kit.manifest.stylesheetLink === 'component') {
        const layer = kit.manifest.stylingLayer;
        notes.push(
          `${name}: the module re-exports the package's ${name}, which loads ${kit.name}'s stylesheet for it too, beside your copy${layer?.owned !== undefined ? `; your copy's rules win, in the ${layer.owned} layer` : '; where the two set the same property, the one loaded last wins'}.`
        );
      }
    } else if (isRequested) {
      notes.push(
        hasStylesheet
          ? `${name}: you own neither its component nor its stylesheet, so nothing is copied; import it from '${files.linked?.import ?? files.component.import}'.`
          : `${name}: it has no separate stylesheet, and you do not own its component, so nothing is copied; import it from '${files.component.import}'.`
      );
    }

    // A component now written in another form loses its earlier files: a
    // requested component everything this run does not write, any other
    // its re-export module once it is copied.
    const written = new Set(
      [...planned.keys()].filter((path) => !before.has(path))
    );
    for (const [path, entry] of ledgerEntries) {
      if (!forTarget(entry) || written.has(path) || planned.has(path)) continue;
      if (entry.piece === 'helper') {
        if (!isRequested || !helperOwners(entry).includes(name)) continue;
        const others = helperOwners(entry).filter(
          (owner) => owner !== name && presentComponents.has(owner)
        );
        if (others.length > 0) {
          releases.push({ path, component: name });
        } else {
          removals.add(path);
        }
        continue;
      }
      if (entry.component !== name) continue;
      if (isRequested || (entry.piece === 're-export' && copyComponent)) {
        removals.add(path);
      }
    }
  }

  // A component released from a helper this run is no longer one of its
  // owners, even where another component plans the helper again.
  for (const { path, component } of releases) {
    const source = ledgerEntries.find(([entryPath]) => entryPath === path)?.[1]
      .source;
    helpers.get(source)?.components.delete(component);
  }

  // A root copied after its parts: their copies still import the
  // package's root until update points them at this one.
  for (const name of requested) {
    const component = kit.component(name);
    if (component?.parts === undefined || copiedComponents.has(name)) continue;
    const rootCopied = [...planned.values()].some(
      (file) => file.component === name && file.piece === 'component'
    );
    if (!rootCopied) continue;
    const parts = component.parts.filter(
      (part) => copiedComponents.has(part) && !processed.has(part)
    );
    if (parts.length > 0) {
      notes.push(
        `Your ${parts.length === 1 ? 'copy' : 'copies'} of ${parts.join(', ')} still ${parts.length === 1 ? 'imports' : 'import'} the package's ${name}: \`update\` points ${parts.length === 1 ? 'it' : 'them'} at this copy.`
      );
    }
  }

  // A copied root's parts left in the package import the package's root,
  // not the copy.
  for (const name of requested) {
    const component = kit.component(name);
    if (component?.parts === undefined) continue;
    const rootFiles = kit.filesOf(name, target);
    const rootCopied = [...planned.values()].some(
      (file) => file.component === name && file.piece === 'component'
    );
    if (!rootCopied || rootFiles === undefined) continue;
    const left = component.parts.filter((part) => {
      if (processed.has(part) || copiedComponents.has(part)) return false;
      const partFiles = kit.filesOf(part, target);
      return (partFiles?.component.imports ?? []).some(
        (specifier) =>
          isRelative(specifier) &&
          kit.resolveRelative(partFiles.component.path, specifier, 'code') ===
            rootFiles.component.path
      );
    });
    if (left.length > 0) {
      notes.push(
        `${left.join(', ')} ${left.length === 1 ? 'stays' : 'stay'} in the package, where ${left.length === 1 ? 'it imports' : 'they import'} the package's ${name}, not your copy: add ${left.length === 1 ? 'it' : 'them'} too (add ${[name, ...left].join(' ')}) to use ${left.length === 1 ? 'it' : 'them'} with the copy.`
      );
    }
  }

  // Shared modules: an owned module copied whole, or only the files the
  // copies reach; an asset a copied stylesheet references comes along
  // whoever owns its shared module.
  const planShared = (sharedModule, file) =>
    plan({
      path: sharedPath(sharedModule, file),
      piece: 'shared',
      layer: sharedModule.name,
      source: file.path,
      requested: false,
      named: false,
      make: (context) => {
        const content = kit.read(file.path);
        return typeof content === 'string'
          ? context.rewrite(content, file.path, context.path)
          : content;
      },
    });
  for (const sharedModule of kit.manifest.shared ?? []) {
    if (
      owns.sharedModule(sharedModule.name) &&
      sharedModule.copy !== 'reached'
    ) {
      for (const file of sharedModule.files) planShared(sharedModule, file);
    }
  }
  const visited = new Set();
  const reach = (source) => {
    if (visited.has(source) || !isText(source)) return;
    visited.add(source);
    for (const { specifier, kind } of findSpecifiers(
      kit.read(source),
      source
    )) {
      const target = resolveSpecifier(kit, source, specifier, kind);
      if (target?.shared === undefined) continue;
      const { sharedModule, file } = target.shared;
      if (kind === 'url' || owns.sharedModule(sharedModule.name)) {
        planShared(sharedModule, file);
        reach(file.path);
      }
    }
  };
  for (const file of [...planned.values()]) {
    if (file.piece !== 're-export') reach(file.source);
  }
  for (const path of options.sharedFiles ?? []) {
    const shared = kit.sharedFileAt(path);
    if (shared !== undefined) planShared(shared.sharedModule, shared.file);
  }

  return {
    owns,
    notes,
    warnings,
    files: [...planned.values()],
    removals: [...removals],
    releases,
    kept: kept.filter((path) => !planned.has(path)),
    named,
    /** Builds each planned file's content, with the mapping complete. */
    build() {
      // Each kit file maps to one consumer path: the one this run writes,
      // else the first the ledger records for the target. A component left
      // as a re-export module maps to the module.
      const mapping = new Map();
      const ledgerMapping = new Map();
      const reExportMapping = new Map();
      for (const [path, entry] of ledgerEntries) {
        if (removals.has(path)) continue;
        if (entry.layer === undefined && !forTarget(entry)) continue;
        const into =
          entry.piece === 're-export' ? reExportMapping : ledgerMapping;
        if (!into.has(entry.source)) into.set(entry.source, path);
      }
      for (const [source, path] of reExportMapping) {
        if (!ledgerMapping.has(source)) ledgerMapping.set(source, path);
      }
      for (const [source, path] of ledgerMapping) mapping.set(source, path);
      for (const file of planned.values()) {
        if (file.piece === 're-export') continue;
        mapping.set(file.source, file.path);
      }
      for (const file of planned.values()) {
        if (
          file.piece === 're-export' &&
          !planned.has(mapping.get(file.source))
        ) {
          mapping.set(file.source, file.path);
        }
      }
      const context = createContext({
        kit,
        target,
        alias,
        mapping,
        warnings,
        planned,
        copiedComponents,
      });
      // A kept copy links its stylesheet as it was written to.
      for (const file of planned.values()) {
        file.content = file.make({
          ...context,
          path: file.path,
          stylesheetLink: file.stylesheetLink ?? stylesheetLink,
        });
      }
      return this.files;
    },
  };
}

/** The components a helper's ledger entry records. */
function helperOwners(entry) {
  if (entry === undefined) return [];
  return (
    entry.components ?? (entry.component !== undefined ? [entry.component] : [])
  );
}

/** The compound a component belongs to: its root's name, or its own for a root. */
function compoundOf(kit, name) {
  const component = kit.component(name);
  if (component?.partOf !== undefined) return component.partOf;
  return component?.parts !== undefined ? name : undefined;
}

/**
 * What a specifier in a kit file names: a kit file, and the shared module
 * file it is when it is one.
 *
 * @returns {{ path: string, shared?: { sharedModule: object, file: object } } | undefined}
 */
export function resolveSpecifier(kit, fromPath, specifier, kind) {
  // Every copy of the layer order module is the one the copies are made
  // with, so a stylesheet loading any of them maps to the same consumer copy.
  const asShared = (path) => {
    if (path === undefined) return undefined;
    const orderModule = kit.layerOrderModuleAt(path);
    return orderModule !== undefined
      ? { path: orderModule.path }
      : { path, shared: kit.sharedFileAt(path) };
  };
  if (kind === 'url' || isRelative(specifier)) {
    return asShared(kit.resolveRelative(fromPath, specifier, kind));
  }
  if (kind === 'style') {
    if (specifier.startsWith('pkg:')) {
      const shared = kit.resolvePackageSpecifier(specifier.slice(4), 'style');
      return shared && { path: shared.file.path, shared };
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(specifier) || specifier.startsWith('/'))
      return undefined;
    // Sass tries a URL relative to the file first, then the load paths.
    const relative = kit.resolveRelative(fromPath, `./${specifier}`, 'style');
    if (relative !== undefined) return asShared(relative);
    const shared = kit.resolveLoadPath(specifier);
    return shared && { path: shared.file.path, shared, loadPath: true };
  }
  const shared = kit.resolvePackageSpecifier(specifier, 'code');
  return shared && { path: shared.file.path, shared };
}

/** The helpers every planned file's content is built with. */
function createContext({
  kit,
  target,
  alias,
  mapping,
  warnings,
  planned,
  copiedComponents,
}) {
  const aliased = (fromPath, specifier) => {
    if (alias === undefined || !specifier.startsWith('../')) return specifier;
    const absolute = posix.normalize(
      posix.join(posix.dirname(fromPath), specifier)
    );
    for (const [prefix, replacement] of Object.entries(alias)) {
      if (absolute.startsWith(prefix))
        return `${replacement}${absolute.slice(prefix.length)}`;
    }
    return specifier;
  };

  /** A kit file's text with every specifier pointed at the copies or the package. */
  const rewrite = (content, sourcePath, consumerPath) =>
    replaceSpecifiers(content, consumerPath, (specifier, kind) => {
      if (
        kind === 'code' &&
        !isRelative(specifier) &&
        !kit.ownsSpecifier(specifier)
      ) {
        return undefined;
      }
      const resolved = resolveSpecifier(kit, sourcePath, specifier, kind);
      if (
        resolved === undefined &&
        kind === 'style' &&
        !isRelative(specifier) &&
        !/^[a-z][a-z0-9+.-]*:/i.test(specifier) &&
        !specifier.startsWith('/')
      ) {
        warnings.push(
          `${consumerPath} loads '${specifier}' through a Sass load path, and none of ${kit.name}'s shared modules has it; your Sass load paths have to provide it`
        );
        return undefined;
      }
      if (resolved === undefined) {
        if (isRelative(specifier) && kind !== 'url') {
          warnings.push(
            `${consumerPath} imports '${specifier}', which is not in the kit's manifest; copied as it is`
          );
        }
        return undefined;
      }
      const copy = mapping.get(resolved.path);
      if (copy !== undefined) {
        if (kind === 'code') {
          // A component present as a re-export module is imported by the
          // module's path, without the component file's extension.
          const original =
            extname(copy) !== extname(resolved.path) &&
            extname(specifier) !== ''
              ? specifier.slice(0, specifier.length - extname(specifier).length)
              : specifier;
          return aliased(
            consumerPath,
            moduleSpecifier(consumerPath, copy, original, resolved.path)
          );
        }
        return kind === 'style'
          ? stylesheetSpecifier(consumerPath, copy)
          : relativeSpecifier(consumerPath, copy);
      }
      if (resolved.shared !== undefined) {
        const published = resolved.shared.file.import;
        if (published === undefined || kind === 'url') {
          warnings.push(
            `${consumerPath} loads '${specifier}', which is neither copied nor published by the kit; copied as it is`
          );
          return undefined;
        }
        return kind === 'style' ? `pkg:${published}` : published;
      }
      const role = kit.componentFileAt(resolved.path, target);
      if (role !== undefined) {
        // A component left in the package is imported through its linked
        // module, which loads the kit's stylesheet for it.
        const files = kit.filesOf(role.component, target);
        const file =
          role.piece === 'component'
            ? files.linked?.import !== undefined
              ? files.linked
              : files.component
            : files[role.piece];
        if (file?.import !== undefined) return file.import;
      }
      if (isRelative(specifier)) {
        warnings.push(
          `${consumerPath} imports '${specifier}', which is not copied and has no import in the package; copied as it is`
        );
      }
      return undefined;
    });

  /** The specifier a copy links a stylesheet by, from a code file. */
  const linkFrom = (fromPath, toPath, extension) => {
    if (extension === '.html')
      return posix.relative(posix.dirname(fromPath), toPath);
    const relative = relativeSpecifier(fromPath, toPath);
    return extension === '.vue' ? relative : aliased(fromPath, relative);
  };

  // A copied Vue or Svelte component's own style block moves to the owned
  // layer too, as a copied stylesheet does.
  const componentContent = (context, name, files, copySheet) => {
    const content = componentText(context, name, files, copySheet);
    return ['.vue', '.svelte'].includes(extname(files.component.path))
      ? ownedLayer(kit, content)
      : content;
  };

  const componentText = (context, name, files, copySheet) => {
    const source = files.component.path;
    const extension = extname(source);
    const builtLink =
      files.stylesheet === undefined
        ? undefined
        : extension === '.html'
          ? posix.relative(posix.dirname(source), files.stylesheet.path)
          : relativeSpecifier(source, files.stylesheet.path);
    const stripped = relinkStylesheet(
      kit.read(source),
      extension,
      builtLink,
      undefined
    );
    if (stripped.warning !== undefined) {
      warnings.push(`${context.path} ${stripped.warning}`);
      return context.rewrite(stripped.content, source, context.path);
    }
    const rewritten =
      extension === '.html'
        ? stripped.content
        : context.rewrite(stripped.content, source, context.path);
    if (files.stylesheet === undefined || context.stylesheetLink === 'none')
      return rewritten;
    const sheetCopy = copySheet
      ? mapping.get(files.stylesheet.path)
      : undefined;
    const specifier =
      sheetCopy !== undefined
        ? linkFrom(context.path, sheetCopy, extension)
        : files.css?.import;
    if (specifier === undefined) return rewritten;
    return relinkStylesheet(rewritten, extension, undefined, specifier).content;
  };

  const reExportContent = (context, name, files) => {
    const lines = [];
    const sheetCopy = mapping.get(files.stylesheet.path);
    if (context.stylesheetLink !== 'none' && sheetCopy !== undefined) {
      lines.push(`import '${linkFrom(context.path, sheetCopy, '.ts')}';`);
    }
    // On the SFC targets the component is its module's default export:
    // the module re-exports it by name, and as its own default, so an
    // import written for the component file works on the module.
    const singleFile = target === 'vue' || target === 'svelte';
    const reExport = (exportName, specifier, own = false) => {
      if (singleFile) {
        lines.push(
          own
            ? `export { default, default as ${exportName} } from '${specifier}';`
            : `export { default as ${exportName} } from '${specifier}';`
        );
      }
      lines.push(`export * from '${specifier}';`);
    };
    reExport(name, files.component.import, true);
    // The parts the consumer does not own come from the same place.
    for (const part of kit.component(name).parts ?? []) {
      const partFiles = kit.filesOf(part, target);
      const owned =
        copiedComponents.has(part) ||
        [...planned.values()].some(
          (file) => file.component === part && file.piece === 'component'
        );
      const partImport =
        partFiles?.linked?.import ?? partFiles?.component.import;
      if (!owned && partImport !== undefined) {
        reExport(part, partImport);
      }
    }
    return `${lines.join('\n')}\n`;
  };

  return { rewrite, componentContent, reExportContent };
}

/**
 * A copied stylesheet with its rules moved from the components layer to
 * the kit's owned layer, when the kit declares one; the layer order
 * statement stays as it is.
 */
export function ownedLayer(kit, content) {
  const layer = kit.manifest.stylingLayer;
  if (layer?.owned === undefined || typeof content !== 'string') return content;
  const name = layer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return content.replace(
    new RegExp(`@layer\\s+${name}\\s*\\{`, 'g'),
    `@layer ${layer.owned} {`
  );
}
