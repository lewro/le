// Landing page built strictly from the le-ui library (instances + layout frames + tokens).
// node le.js new landing-ui --libs le-ui < examples/landing-ui.dsl && node le.js lint landing-ui
frame Landing col w=1440 bg=$Surface/0 tag=main
  instance Navbar w=fill
  frame Hero col w=fill p=96,80,80,80 gap=24 items=center bg=$Surface/50 tag=section
    instance Badge Tone=Brand "Trusted by 2,400+ local professionals"
    text Title "Find the right local expert\nfor any job" ts=Display color=$Ink/900 align=center w=820 tag=h1
    text Subtitle "Plumbers, tutors, designers, accountants and more. Verified profiles, real reviews, no middlemen." ts=Body/Large color=$Ink/600 align=center w=640
    frame Search row gap=12 items=end
      instance Input Label.text="What do you need?" Placeholder.text="e.g. plumber, tutor, photographer" w=420
      instance Input Label.text="Where" Placeholder.text="Vienna" w=200
      instance Button Type=Primary Size=Large "Search"
    frame Stats row gap=48 items=center
      instance Stat Value.text="2,400+" Caption.text="experts"
      instance Stat Value.text="18,000" Caption.text="jobs completed"
      instance Stat Value.text="4.9/5" Caption.text="average rating"
  frame Categories col w=fill p=80 gap=40 items=center tag=section
    instance SectionHeader Title.text="Browse by category" Subtitle.text="Hundreds of verified professionals across the most requested services."
    frame Grid row wrap w=fill gap=24 rowgap=24 justify=center
      instance Card Title.text="Home & Repair" Body.text="Plumbing, electrics, painting, carpentry and moving." Link.text="312 experts"
      instance Card Title.text="Education" Body.text="Tutors, language teachers, music lessons and coaching." Link.text="188 experts"
      instance Card Title.text="Business" Body.text="Accountants, legal advice, marketing and consulting." Link.text="256 experts"
      instance Card Title.text="Creative" Body.text="Photographers, designers, video and event production." Link.text="141 experts"
  frame CTA col w=fill p=80 gap=20 items=center bg=$Ink/900 tag=section
    text Title "Are you a local expert?" ts=Heading/H2 color=$Surface/0 align=center tag=h2
    text Body "Create a free profile and start receiving requests from people nearby." ts=Body/Large color=$Ink/400 align=center w=560
    instance Button Type=Primary Size=Large "Create your profile"
  instance Footer w=fill
