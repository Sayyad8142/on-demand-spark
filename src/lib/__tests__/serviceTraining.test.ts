import { describe, expect, it } from 'vitest';
import { serviceTrainingSlides } from '../serviceTraining';
const ids = (tasks: unknown) => serviceTrainingSlides({ service_type: 'maid', maid_tasks: tasks }).map(s => s.step);
describe('booked training sequences', () => {
  it('dishwashing only has five approved steps and no general floor tasks', () => {
    expect(ids(['dish_washing'])).toEqual(['dish_before_washing','dish_washing_dishes','dish_arrange_dishes','dish_clean_granite','dish_clean_floor']);
  });
  it('floor only has five floor steps and no dishwashing', () => {
    expect(ids(['floor_cleaning'])).toEqual(['floor_before','floor_sweeping','floor_corners','floor_mopping','floor_final']);
  });
  it('both tasks combine ten steps in fixed order without duplication', () => {
    const both = ids(['floor_cleaning','dish_washing','dish_washing']);
    expect(both).toEqual([...ids(['dish_washing']), ...ids(['floor_cleaning'])]);
    expect(both).toHaveLength(10);
    expect(new Set(both).size).toBe(10);
  });
  it('bathroom without add-on has six steps and no glass', () => {
    expect(serviceTrainingSlides({service_type:'bathroom_cleaning',has_glass_partition:false}).map(s=>s.step)).toEqual(['bathroom_before','bathroom_toilet','bathroom_basin','bathroom_tiles','bathroom_floor','bathroom_final']);
  });
  it('explicit glass add-on adds exactly one photo before final bathroom', () => {
    const slides=serviceTrainingSlides({service_type:'bathroom_cleaning',has_glass_partition:true});
    expect(slides).toHaveLength(7);
    expect(slides.slice(-2).map(s=>s.step)).toEqual(['bathroom_glass','bathroom_final']);
  });
  it('unknown, missing or contradictory tasks never guess', () => {
    for(const value of [null,[],['unknown'],['dish_washing','unknown'],'dish_washing']) expect(ids(value)).toEqual([]);
    expect(serviceTrainingSlides({service_type:'bathroom_cleaning',maid_tasks:['dish_washing']})).toEqual([]);
    expect(serviceTrainingSlides({service_type:'cook',maid_tasks:['dish_washing']})).toEqual([]);
  });
  it('a truthy string or missing glass flag cannot add glass', () => {
    for(const flag of [null,undefined,'true',1]) expect(serviceTrainingSlides({service_type:'bathroom_cleaning',has_glass_partition:flag})).toHaveLength(6);
  });
});