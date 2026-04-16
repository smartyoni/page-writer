# 아키텍처 및 구조 가이드

## 프로젝트 구조

```
App.tsx                    ← 오케스트레이터 (조립만 수행, 로직 금지, 300줄 이하)
hooks/                     ← 비즈니스 로직 (Custom Hooks)
  useAppState.ts           ← 핵심 상태, 초기화, 네트워크/모바일 감지, 캘린더
  useTabManagement.ts      ← 탭 CRUD, 선택, 스와이프, 색상
  useSectionManagement.ts  ← 섹션 CRUD, 드래그앤드롭, 아이템 이동
  useMemoEditor.ts         ← 메모 표시/저장/삭제, 기호 삽입
  useNavigation.ts         ← 목차/섹션맵/태그 네비게이션, 스크롤
  useBookmarks.ts          ← 북마크 뷰 상태, 섹션 관리
  useFirestoreSync.ts      ← Firestore 실시간 동기화
  useGoogleCalendar.ts     ← Google Calendar API 연동
  useSwipeGesture.ts       ← 터치 스와이프 제스처
  useClickOutside.ts       ← 외부 클릭 감지
components/
  MainContent.tsx          ← 메인 그리드, 헤더, 섹션 카드 렌더링
  AppModals.tsx            ← 모든 모달 (메모, 이동, 확인, 목차 등)
  FooterTabs.tsx           ← 하단 탭바
  Header.tsx               ← 상단 헤더
  SectionCard.tsx          ← 섹션 카드 컴포넌트
  ParkingWidget.tsx        ← 주차 위젯
  NavigationMapModal.tsx   ← 목차 모달
  (기타 Modal/UI 컴포넌트)
firebase/                  ← Firebase 설정
types.ts                   ← 공유 타입 정의
utils/                     ← 유틸리티 함수
```

## 핵심 원칙

### 1. App.tsx 보호
- App.tsx에 직접 비즈니스 로직 추가 금지
- 새 기능은 반드시 별도 Hook/Component로 작성 후 App.tsx에서 조립
- App.tsx 수정이 필요하면: Hook 추가 → MainContent에 prop 추가 → AppModals에 모달 추가

### 2. 계층 구조 (위→아래 단방향만 허용)
```
App.tsx → hooks/ → firebase/ → Firestore
       → components/ (MainContent, AppModals, FooterTabs)
```
- 컴포넌트가 직접 Firestore를 호출하면 안 됨
- 반드시 Hook을 통해 접근

### 3. 파일 크기 규칙
- 100줄 이하: 이상적
- 200줄 이하: 허용
- 300줄 초과: 반드시 분리 검토

### 4. 새 기능 추가 절차
1. 관련 상태+핸들러를 `hooks/use[Feature].ts`로 작성
2. UI가 필요하면 `components/`에 컴포넌트 생성
3. 모달이면 `AppModals.tsx`에 추가, 메인 뷰면 `MainContent.tsx`에 추가
4. `App.tsx`에서 훅 호출 후 컴포넌트에 prop 전달
5. App.tsx에 직접 로직 작성 금지

### 5. 새 데이터 로직 추가 절차
1. `useFirestoreSync.ts` 또는 새 훅에서 Firestore 접근
2. 훅이 300줄을 초과하면 기능 단위로 분리
