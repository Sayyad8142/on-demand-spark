import { DISHWASHING_TRAINING_PHOTOS, trainingSlides } from './dishwashingTraining';
import floorBefore from '@/assets/floor-training/floor_before.webp';
import floorSweeping from '@/assets/floor-training/floor_sweeping.webp';
import floorCorners from '@/assets/floor-training/floor_corners.webp';
import floorMopping from '@/assets/floor-training/floor_mopping.webp';
import floorFinal from '@/assets/floor-training/floor_final.webp';
import bathroomBefore from '@/assets/bathroom-training/bathroom_before.webp';
import bathroomToilet from '@/assets/bathroom-training/bathroom_toilet.webp';
import bathroomBasin from '@/assets/bathroom-training/bathroom_basin.webp';
import bathroomTiles from '@/assets/bathroom-training/bathroom_tiles.webp';
import bathroomFloor from '@/assets/bathroom-training/bathroom_floor.webp';
import bathroomFinal from '@/assets/bathroom-training/bathroom_final.webp';
import bathroomGlass from '@/assets/bathroom-training/bathroom_glass.webp';
import dishFallback from '@/assets/service-dish-washing.webp';
import floorFallback from '@/assets/service-floor-cleaning.webp';
import bathroomFallback from '@/assets/service-bathroom-toilet-cleaning.jpg';

export interface TrainingSlide { step: string; label: string; src: string; fallbackSrc?: string; task?: string; price?: number }
export interface TrainingBooking { service_type?: string | null; maid_tasks?: unknown; has_glass_partition?: unknown }
const floor: TrainingSlide[] = [
  ['floor_before', 'Before Floor Cleaning', floorBefore],
  ['floor_sweeping', 'Sweeping Floor', floorSweeping],
  ['floor_corners', 'Cleaning Accessible Corners', floorCorners],
  ['floor_mopping', 'Mopping Floor', floorMopping],
  ['floor_final', 'Clean Dry Floor', floorFinal],
].map(([step, label, src]) => ({ step, label, src, task: 'floor_cleaning', fallbackSrc: floorFallback }));
const bathroom: TrainingSlide[] = [
  ['bathroom_before', 'Before Bathroom Cleaning', bathroomBefore],
  ['bathroom_toilet', 'Cleaning Toilet', bathroomToilet],
  ['bathroom_basin', 'Cleaning Basin Taps and Mirror', bathroomBasin],
  ['bathroom_tiles', 'Scrubbing Wall Tiles', bathroomTiles],
  ['bathroom_floor', 'Scrubbing Bathroom Floor', bathroomFloor],
  ['bathroom_final', 'Clean Bathroom', bathroomFinal],
].map(([step, label, src]) => ({ step, label, src, fallbackSrc: bathroomFallback }));

/** Display only: explicit task IDs and boolean add-on, never inferred from money. */
export function serviceTrainingSlides(b: TrainingBooking): TrainingSlide[] {
  if (b.service_type === 'bathroom_cleaning') {
    if (Array.isArray(b.maid_tasks) && b.maid_tasks.length > 0) return [];
    return b.has_glass_partition === true
      ? [...bathroom.slice(0, -1), { step: 'bathroom_glass', label: 'Cleaning Glass Partition', src: bathroomGlass, fallbackSrc: bathroomFallback }, ...bathroom.slice(-1)]
      : bathroom;
  }
  if (b.service_type !== 'maid' || !Array.isArray(b.maid_tasks) || b.maid_tasks.length === 0 ||
      b.maid_tasks.some(t => t !== 'dish_washing' && t !== 'floor_cleaning')) return [];
  return [
    ...(b.maid_tasks.includes('dish_washing') ? trainingSlides(DISHWASHING_TRAINING_PHOTOS).map(s => ({ ...s, step: `dish_${s.step}`, task: 'dish_washing', fallbackSrc: dishFallback })) : []),
    ...(b.maid_tasks.includes('floor_cleaning') ? floor : []),
  ];
}

export function serviceTrainingFallback(b: TrainingBooking): string | null {
  if (b.service_type === 'bathroom_cleaning') return bathroomFallback;
  if (b.service_type !== 'maid') return null;
  return Array.isArray(b.maid_tasks) && b.maid_tasks.length === 1 && b.maid_tasks[0] === 'dish_washing' ? dishFallback : floorFallback;
}