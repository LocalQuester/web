# 브랜치 운영

- 기본 브랜치: develop
- 일반 작업: develop에서 타입/이슈번호-설명 브랜치 생성 후 develop 대상 PR
- 운영 배포: 검증된 develop에서 main 대상 PR 생성
- 배포 이슈: 제목에 배포를 포함한 별도 이슈 생성
- 배포 PR 제목: release: 배포 내용
- 배포 PR 본문: Closes #배포이슈번호
- main과 develop 직접 push 금지, 필수 검사 및 리뷰 대화 해결 후 병합
- 이슈 자체는 특정 브랜치에 속하지 않습니다.
- main 병합 전 develop의 검증 완료 여부와 포함 커밋을 확인합니다.
- 자동 배포 및 이미지 발행은 main 기준으로 유지합니다.