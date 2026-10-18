import {
  DEMO_ATTRIBUTION,
  GarmentFixtureSchema,
  catalogProductFromGarment,
  filterCatalog,
  type CatalogProduct,
  type RetailerAdapter,
} from '@fitmirror/shared';
import chino from '../../../../fixtures/garments/bottom-chino.json';
import jogger from '../../../../fixtures/garments/bottom-jogger.json';
import straightJean from '../../../../fixtures/garments/bottom-straight-jean.json';
import midiDress from '../../../../fixtures/garments/dress-midi.json';
import choreJacket from '../../../../fixtures/garments/outerwear-chore-jacket.json';
import crewTee from '../../../../fixtures/garments/top-crew-tee.json';
import oxfordShirt from '../../../../fixtures/garments/top-oxford-shirt.json';
import relaxedKnit from '../../../../fixtures/garments/top-relaxed-knit.json';

const FIXTURE_SOURCES = [
  chino,
  jogger,
  straightJean,
  midiDress,
  choreJacket,
  crewTee,
  oxfordShirt,
  relaxedKnit,
];

const fixtureProducts: readonly CatalogProduct[] = FIXTURE_SOURCES.map((raw) =>
  catalogProductFromGarment(GarmentFixtureSchema.parse(raw)),
);

export const fixtureCatalogAdapter: RetailerAdapter = {
  id: 'fixture',
  label: 'Demo catalog',
  attribution: DEMO_ATTRIBUTION,
  search(query) {
    return Promise.resolve(filterCatalog(fixtureProducts, query));
  },
};
