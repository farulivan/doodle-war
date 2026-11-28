import type { UnitKind } from '@doodle/sim';
import type { Design } from '../rig';
import { glueDesign } from './glue';
import { highlighterDesign } from './highlighter';
import { pencilDesign } from './pencil';
import { planeDesign } from './plane';
import { squidDesign } from './squid';
import { staplerDesign } from './stapler';

export const DESIGNS: Record<UnitKind, Design> = {
  pencil: pencilDesign,
  squid: squidDesign,
  plane: planeDesign,
  stapler: staplerDesign,
  highlighter: highlighterDesign,
  glue: glueDesign,
};
