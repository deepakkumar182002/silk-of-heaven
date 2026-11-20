import OutfitsView from '../views/OutfitsView.jsx';
import TuneView from '../views/TuneView.jsx';
import DnaView from '../views/DnaView.jsx';
import BodyView from '../views/BodyView.jsx';
import PersonalityView from '../views/PersonalityView.jsx';
import StoryView from '../views/StoryView.jsx';

export default function Panel(props) {
  const { view } = props;
  const cls = (v) => 'view' + (view === v ? '' : ' hidden');
  return (
    <aside id="panel" className="glass">
      <div className={cls('outfits')}><OutfitsView {...props} /></div>
      <div className={cls('tune')}><TuneView {...props} /></div>
      <div className={cls('dna')}><DnaView {...props} active={view === 'dna'} /></div>
      <div className={cls('body')}><BodyView {...props} /></div>
      <div className={cls('personality')}><PersonalityView {...props} /></div>
      <div className={cls('story')}><StoryView {...props} active={view === 'story'} /></div>
    </aside>
  );
}
