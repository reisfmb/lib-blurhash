/**
 * Guillotine extension: a `blurhash` field on `media_Image`.
 *
 * Headless is where BlurHash is normally used — the frontend decodes on the client with the
 * standard package at zero server cost — so the hash should be one field away in GraphQL, not
 * buried under `xAsJson`. `color` and `placeholder` are there for frontends that would rather
 * not decode at all.
 *
 * Not shipped as `guillotine/guillotine.js` from the library: like `cms/cms.yaml`, that is a
 * single app-level path, and a merge with the consumer's own file would silently pick one.
 * The consumer wires it from theirs instead:
 *
 *     // src/main/resources/guillotine/guillotine.ts
 *     import { guillotineExtensions } from '/lib/blurhash';
 *     export const extensions = guillotineExtensions;
 *
 * Nothing here touches XP content: `env.source` is the content Guillotine already read, with
 * `x` keyed the same way the library stores it (app key, dots as dashes; mixin local name).
 */

import { averageColor, isValidHash } from './codec';
import { BlurhashData, dataNamespace } from './content';
import { decode } from './xp';

/** The slice of Guillotine's `graphQL` helper object this extension uses. */
export type GraphQL = {
  GraphQLString: unknown;
  GraphQLInt: unknown;
  nonNull(type: unknown): unknown;
  list(type: unknown): unknown;
  reference(typeName: string): unknown;
};

type FieldDef = { type: unknown; description?: string; args?: Record<string, unknown> };
type CreationParams = { addFields(fields: Record<string, FieldDef>): void };
type Env<Source> = { source: Source; args: Record<string, unknown>; localContext: Record<string, unknown> };

type ImageSource = { x?: Record<string, Record<string, unknown> | undefined> };

/** What `media_Image.blurhash` resolves to; the parent of the `BlurHash` fields. */
type BlurHashSource = { hash: string; width: number; height: number };

const IMAGE_TYPE = 'media_Image';
const MIXIN_NAME = 'blurhash';
const TYPE_NAME = 'BlurHash';

/**
 * Build the `extensions` object Guillotine expects. Spread it into your own if you have other
 * extensions: `{ ...guillotineExtensions(graphQL), ...mine }` — the keys do not overlap unless
 * you also extend `media_Image`, in which case merge those two callbacks by hand.
 */
export function guillotineExtensions(graphQL: GraphQL) {
  return {
    types: {
      [TYPE_NAME]: {
        description: 'BlurHash of an image: the hash itself, its average colour, and a decoded placeholder',
        fields: {
          hash: {
            type: graphQL.nonNull(graphQL.GraphQLString),
            description: 'The BlurHash string. Decode it client-side, or use `placeholder`.',
          },
          color: {
            type: graphQL.GraphQLString,
            description: "Average colour as '#rrggbb', read from the hash without decoding.",
          },
          placeholder: {
            type: graphQL.GraphQLString,
            description:
              'PNG data URI, long edge 32 px, at the aspect ratio of `width`/`height` (default: the image). ' +
              'Any pair with the same ratio gives the same image.',
            args: {
              width: graphQL.GraphQLInt,
              height: graphQL.GraphQLInt,
            },
          },
        },
      },
    },

    creationCallbacks: {
      [IMAGE_TYPE]: (params: CreationParams) => {
        params.addFields({
          blurhash: {
            type: graphQL.reference(TYPE_NAME),
            description: 'BlurHash data, or null when the image has no valid hash yet',
          },
        });
      },
    },

    resolvers: {
      [IMAGE_TYPE]: {
        blurhash: (env: Env<ImageSource>): BlurHashSource | null => {
          const namespace = dataNamespace(app.name);
          const stored = namespace ? (env.source.x?.[namespace]?.[MIXIN_NAME] as BlurhashData | undefined) : undefined;
          if (!isValidHash(stored?.hash)) return null;

          const info = (env.source.x?.media?.imageInfo ?? {}) as { imageWidth?: number; imageHeight?: number };
          return { hash: stored.hash, width: info.imageWidth || 4, height: info.imageHeight || 3 };
        },
      },
      [TYPE_NAME]: {
        color: (env: Env<BlurHashSource>) => averageColor(env.source.hash),
        placeholder: (env: Env<BlurHashSource>) =>
          decode(env.source.hash, {
            width: positive(env.args.width) ?? env.source.width,
            height: positive(env.args.height) ?? env.source.height,
          }),
      },
    },
  };
}

function positive(value: unknown): number | undefined {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : undefined;
}
