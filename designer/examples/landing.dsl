// Local Experts — marketing landing page (desktop, 1440px)
frame Landing col w=1440 bg=#ffffff tag=main
  frame Header row w=fill h=72 p=0,80 gap=32 items=center justify=between tag=header
    text Logo "LocalExperts" size=22 weight=800 color=#0f172a
    frame Nav row gap=28 items=center tag=nav
      text "Find experts" size=15 weight=500 color=#334155 tag=a href=/search
      text "Categories" size=15 weight=500 color=#334155 tag=a href=/categories
      text "Interviews" size=15 weight=500 color=#334155 tag=a href=/interviews
      text "Pricing" size=15 weight=500 color=#334155 tag=a href=/pricing
    frame Actions row gap=12 items=center
      frame LoginButton row p=10,18 r=8 items=center justify=center stroke=#e2e8f0 bg=#ffffff tag=a href=/login
        text "Log in" size=14 weight=600 color=#0f172a
      frame SignupButton row p=10,18 r=8 items=center justify=center bg=#2563eb tag=a href=/register
        text "Join as expert" size=14 weight=600 color=#ffffff
  frame Hero col w=fill p=96,80,80,80 gap=24 items=center bg=#f8fafc tag=section
    frame Badge row p=6,14 r=999 bg=#dbeafe
      text "Trusted by 2,400+ local professionals" size=13 weight=600 color=#1d4ed8
    text Title "Find the right local expert\nfor any job" w=820 size=60 weight=800 lh=68 ls=-1.5 align=center color=#0f172a tag=h1
    text Subtitle "Plumbers, tutors, designers, accountants and more. Verified profiles, real reviews, no middlemen." w=640 size=19 lh=30 align=center color=#475569 tag=p
    frame SearchBar row w=720 p=8,8,8,24 gap=12 items=center r=14 bg=#ffffff stroke=#e2e8f0 shadow=0,8,24,0,#0f172a14 tag=form
      text "What do you need help with?" w=fill size=16 color=#94a3b8 tag=span
      line Divider w=1 h=28 stroke=#e2e8f0
      text "Vienna" w=120 size=16 color=#0f172a tag=span
      frame SearchButton row p=12,22 r=10 items=center bg=#2563eb tag=button
        text "Search" size=15 weight=600 color=#ffffff
    frame Stats row gap=48 items=center
      frame Stat col gap=4 items=center
        text "2,400+" size=28 weight=800 color=#0f172a
        text "experts" size=14 color=#64748b
      frame Stat col gap=4 items=center
        text "18,000" size=28 weight=800 color=#0f172a
        text "jobs completed" size=14 color=#64748b
      frame Stat col gap=4 items=center
        text "4.9/5" size=28 weight=800 color=#0f172a
        text "average rating" size=14 color=#64748b
  frame Categories col w=fill p=80 gap=40 items=center tag=section
    frame SectionHeader col gap=12 items=center
      text "Browse by category" size=36 weight=800 ls=-0.5 color=#0f172a tag=h2
      text "Hundreds of verified professionals across the most requested services." size=17 color=#64748b align=center
    frame Grid row wrap w=fill gap=24 rowgap=24 justify=center
      frame Card col w=304 p=24 gap=16 r=16 bg=#ffffff stroke=#e2e8f0 tag=a href=/c/home
        frame Icon w=48 h=48 r=12 bg=#dbeafe
        text "Home & Repair" size=18 weight=700 color=#0f172a tag=h3
        text "Plumbing, electrics, painting, carpentry and moving." size=14 lh=22 color=#64748b
        text "312 experts" size=13 weight=600 color=#2563eb
      frame Card col w=304 p=24 gap=16 r=16 bg=#ffffff stroke=#e2e8f0 tag=a href=/c/education
        frame Icon w=48 h=48 r=12 bg=#fce7f3
        text "Education" size=18 weight=700 color=#0f172a tag=h3
        text "Tutors, language teachers, music lessons and coaching." size=14 lh=22 color=#64748b
        text "188 experts" size=13 weight=600 color=#2563eb
      frame Card col w=304 p=24 gap=16 r=16 bg=#ffffff stroke=#e2e8f0 tag=a href=/c/business
        frame Icon w=48 h=48 r=12 bg=#dcfce7
        text "Business" size=18 weight=700 color=#0f172a tag=h3
        text "Accountants, legal advice, marketing and consulting." size=14 lh=22 color=#64748b
        text "256 experts" size=13 weight=600 color=#2563eb
      frame Card col w=304 p=24 gap=16 r=16 bg=#ffffff stroke=#e2e8f0 tag=a href=/c/creative
        frame Icon w=48 h=48 r=12 bg=#fef3c7
        text "Creative" size=18 weight=700 color=#0f172a tag=h3
        text "Photographers, designers, video and event production." size=14 lh=22 color=#64748b
        text "141 experts" size=13 weight=600 color=#2563eb
  frame CTA col w=fill p=80 gap=20 items=center bg=#0f172a tag=section
    text "Are you a local expert?" size=36 weight=800 ls=-0.5 color=#ffffff align=center tag=h2
    text "Create a free profile and start receiving requests from people nearby." w=560 size=17 lh=26 color=#cbd5e1 align=center
    frame CTAButton row p=14,28 r=10 items=center bg=#2563eb tag=a href=/register
      text "Create your profile" size=16 weight=600 color=#ffffff
  frame Footer row w=fill p=40,80 items=center justify=between bg=#ffffff stroke=#e2e8f0 tag=footer
    text "© 2026 LocalExperts" size=14 color=#64748b
    frame FooterLinks row gap=24
      text "Privacy" size=14 color=#64748b tag=a href=/privacy
      text "Terms" size=14 color=#64748b tag=a href=/terms
      text "Contact" size=14 color=#64748b tag=a href=/contact
