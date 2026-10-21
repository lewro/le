// LE UI — a small design system (tokens + components) in the LE Designer DSL.
// Create it with: node le.js lib new le-ui < examples/le-ui.dsl

token Brand/600 #1d4ed8
token Brand/500 #2563eb
token Brand/100 #dbeafe
token Ink/900 #0f172a
token Ink/600 #475569
token Ink/400 #94a3b8
token Line/200 #e2e8f0
token Surface/0 #ffffff
token Surface/50 #f8fafc
token Success/500 #16a34a
token Warning/100 #fef3c7
token Danger/500 #dc2626

textstyle Display size=60 weight=800 lh=68 ls=-1.5
textstyle Heading/H2 size=36 weight=800 lh=44 ls=-0.5
textstyle Heading/H3 size=20 weight=700 lh=28
textstyle Body/Large size=18 lh=28
textstyle Body size=15 lh=24
textstyle Body/Small size=13 lh=20
textstyle Label size=14 weight=600 lh=20
textstyle Caption size=12 weight=500 lh=16

effectstyle Card shadow=0,8,24,0,#0f172a14
effectstyle Floating shadow=0,16,48,-8,#0f172a33

set Button desc="Primary call to action. Type: Primary / Secondary / Ghost. Size: Medium / Large."
  component "Type=Primary, Size=Medium" row p=10,18 gap=8 r=8 items=center justify=center bg=$Brand/500 tag=button
    text Label "Button" ts=Label color=$Surface/0
  component "Type=Primary, Size=Large" row p=14,28 gap=8 r=10 items=center justify=center bg=$Brand/500 tag=button
    text Label "Button" ts=Label color=$Surface/0
  component "Type=Secondary, Size=Medium" row p=10,18 gap=8 r=8 items=center justify=center bg=$Surface/0 stroke=$Line/200 tag=button
    text Label "Button" ts=Label color=$Ink/900
  component "Type=Secondary, Size=Large" row p=14,28 gap=8 r=10 items=center justify=center bg=$Surface/0 stroke=$Line/200 tag=button
    text Label "Button" ts=Label color=$Ink/900
  component "Type=Ghost, Size=Medium" row p=10,18 gap=8 r=8 items=center justify=center bg=none tag=button
    text Label "Button" ts=Label color=$Brand/600
  component "Type=Ghost, Size=Large" row p=14,28 gap=8 r=10 items=center justify=center bg=none tag=button
    text Label "Button" ts=Label color=$Brand/600

set Badge desc="Small status pill. Tone: Brand / Success / Warning."
  component "Tone=Brand" row p=6,14 r=999 bg=$Brand/100
    text Label "Badge" ts=Caption color=$Brand/600
  component "Tone=Success" row p=6,14 r=999 bg=#dcfce7
    text Label "Badge" ts=Caption color=$Success/500
  component "Tone=Warning" row p=6,14 r=999 bg=$Warning/100
    text Label "Badge" ts=Caption color=#b45309

component Input desc="Text input with a label." col w=320 gap=6 tag=label
  text Label "Label" ts=Label color=$Ink/900
  frame Field row w=fill p=12,14 r=8 items=center bg=$Surface/0 stroke=$Line/200 tag=div
    text Placeholder "Placeholder" ts=Body color=$Ink/400 w=fill

component NavLink desc="Top navigation link." row p=8,4 tag=a
  text Label "Link" ts=Label color=$Ink/600

component Navbar desc="Site header: logo, links, actions." row w=1440 h=72 p=0,80 gap=32 items=center justify=between bg=$Surface/0 stroke=$Line/200 tag=header
  text Logo "LocalExperts" size=22 weight=800 ts=Heading/H3 color=$Ink/900
  frame Links row gap=20 items=center tag=nav
    instance NavLink "Find experts"
    instance NavLink "Categories"
    instance NavLink "Interviews"
    instance NavLink "Pricing"
  frame Actions row gap=12 items=center
    instance Button Type=Ghost Size=Medium "Log in"
    instance Button Type=Primary Size=Medium "Join as expert"

component SectionHeader desc="Centered section title + subtitle." col gap=12 items=center w=fill
  text Title "Section title" ts=Heading/H2 color=$Ink/900 align=center tag=h2
  text Subtitle "Section subtitle goes here." ts=Body/Large color=$Ink/600 align=center w=640

component Card desc="Content card with icon, title, body and link." col w=304 p=24 gap=16 r=16 bg=$Surface/0 stroke=$Line/200 effect=Card tag=a
  frame Icon w=48 h=48 r=12 bg=$Brand/100
  text Title "Card title" ts=Heading/H3 color=$Ink/900 tag=h3
  text Body "Supporting copy for this card, two lines at most." ts=Body/Small color=$Ink/600
  text Link "Learn more" ts=Label color=$Brand/600

component Stat desc="Big number with a caption." col gap=4 items=center
  text Value "2,400+" size=28 weight=800 ts=Heading/H2 color=$Ink/900
  text Caption "experts" ts=Body/Small color=$Ink/600

component Footer desc="Site footer." row w=1440 p=40,80 items=center justify=between bg=$Surface/0 stroke=$Line/200 tag=footer
  text Copyright "© 2026 LocalExperts" ts=Body/Small color=$Ink/600
  frame Links row gap=24
    instance NavLink "Privacy"
    instance NavLink "Terms"
    instance NavLink "Contact"
