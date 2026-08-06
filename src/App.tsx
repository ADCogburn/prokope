import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AccountBar } from './auth/AccountBar'
import { SyncStatusIndicator } from './sync/SyncStatusIndicator'
import { RootRedirect } from './board/RootRedirect'
import { ClassBoardRoute } from './board/ClassBoardRoute'
import { CurriculumRoute } from './board/CurriculumRoute'
import { ReportsRoute } from './board/ReportsRoute'

function App() {
  return (
    <BrowserRouter>
      <AccountBar />
      <SyncStatusIndicator />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/class/:classId" element={<ClassBoardRoute />} />
        <Route path="/class/:classId/subject/:subjectId" element={<ClassBoardRoute />} />
        <Route path="/class/:classId/subject/:subjectId/curriculum" element={<CurriculumRoute />} />
        <Route path="/class/:classId/report" element={<ReportsRoute />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
