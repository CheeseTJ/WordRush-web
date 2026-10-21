import { useNavigate } from 'react-router-dom'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { AMEP_HOME, OFFICIAL_COURSES, coursesVisited, markCourseVisited } from '@/data/courses'
import { buzz } from '@/ui'

/**
 * 官方课程页（/courses）：导航到澳洲内政部 AMEPOnline 的免费英语课程。
 *
 * 这里刻意「不是」我们的内容——排版压平、不用圆体、整页纸白，
 * 让人一眼分清「这是外部资源」。也因此不伪造学习进度，只记「打开过」。
 */
export default function Courses() {
  const nav = useNavigate()
  // 阅读记录同步读取即可：本页没有会改变它的内部操作（点击即离开页面）
  const seen = coursesVisited()

  function open(id: string) {
    markCourseVisited(id)
    buzz(6)
  }

  return (
    <div className="view crs-page">
      <div className="qbar">
        <button type="button" className="back" onClick={() => nav(-1)} aria-label="返回">
          ←
        </button>
        <div className="story-title">官方免费课程</div>
      </div>

      <p className="crs-lede">澳洲内政部 AMEP，政府出资，不用付费。</p>

      <ol className="crs-list">
        {OFFICIAL_COURSES.map((c, i) => {
          const isSeen = seen.includes(c.id)
          return (
            <li
              key={c.id}
              className={`crs-item ${isSeen ? 'seen' : ''}`}
              style={{ ['--i' as string]: i }}
            >
              <a
                className="crs-link"
                href={AMEP_HOME}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => open(c.id)}
              >
                <span className="crs-num">{c.num}</span>
                <span className="crs-body">
                  <span className="crs-row">
                    <span className="crs-title">{c.ability}</span>
                    <ArrowSquareOut className="crs-arrow" aria-hidden />
                  </span>
                  <span className="crs-meta">
                    <span>{c.code}</span>
                    {isSeen && <span className="crs-seen">打开过</span>}
                  </span>
                </span>
              </a>
            </li>
          )
        })}
      </ol>

      <p className="crs-foot">
        课程内容与版权归 Department of Home Affairs 所有，我们只做导航。进度记录在你的浏览器里，不上传。
      </p>
    </div>
  )
}
