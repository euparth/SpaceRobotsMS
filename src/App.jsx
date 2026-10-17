import GNCWorkbench from './components/GNCWorkbench.jsx'
import { useSimulation } from './hooks/useSimulation.js'

export default function App() {
  const sim = useSimulation()
  return <GNCWorkbench sim={sim} />
}
